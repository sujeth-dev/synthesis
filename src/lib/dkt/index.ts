// DKT inference in TypeScript (DKT-11): the forward pass of the single-layer
// LSTM trained by Research/dkt/train_synaptic.py, so the app can run it with
// no Python service. Weights come from Research/dkt/export_weights.py.
//
// Inputs are one-hot (skill × correct), so the input-to-hidden product is a
// single column lookup — each step costs one hidden×hidden product.

export interface DktWeightsFile {
  format: 'synaptic-dkt-v1'
  synthetic: boolean          // true when trained on simulated learners
  skills: string[]            // index i ↔ skill id, fixed by content/graph/nodes.json
  hidden_size: number
  // How this model was trained, when the exporter recorded it. Inference
  // ignores it; it is here so a shadow prediction can be traced to a
  // configuration. Absent in models exported before DKT-14.
  training?: { lambda_r: number; early_stopping: boolean; epochs_budget: number; epochs_run: number; best_val_auc: number }
  // float32 little-endian, base64; PyTorch layouts and gate order (i, f, g, o)
  weight_ih: string           // (4H, 2S)
  weight_hh: string           // (4H, H)
  bias_ih: string             // (4H)
  bias_hh: string             // (4H)
  out_weight: string          // (S, H)
  out_bias: string            // (S)
}

export interface DktModel {
  synthetic: boolean
  training?: DktWeightsFile['training']
  skills: string[]
  skillIndex: Map<string, number>
  H: number
  weightIh: Float32Array
  weightHh: Float32Array
  bias: Float32Array          // bias_ih + bias_hh, pre-summed
  outWeight: Float32Array
  outBias: Float32Array
}

export interface DktInteraction { skill_id: string; correct: boolean }

function decode(b64: string, expectedLength: number, name: string): Float32Array {
  const bytes = Buffer.from(b64, 'base64')
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const values = new Float32Array(copy.buffer)
  if (values.length !== expectedLength) throw new Error(`DKT weights: ${name} has ${values.length} values, expected ${expectedLength}`)
  return values
}

export function loadDktModel(file: DktWeightsFile): DktModel {
  if (file.format !== 'synaptic-dkt-v1') throw new Error(`Unsupported DKT weights format: ${file.format}`)
  const S = file.skills.length, H = file.hidden_size
  const biasIh = decode(file.bias_ih, 4 * H, 'bias_ih')
  const biasHh = decode(file.bias_hh, 4 * H, 'bias_hh')
  return {
    synthetic: file.synthetic,
    training: file.training,
    skills: file.skills,
    skillIndex: new Map(file.skills.map((s, i) => [s, i])),
    H,
    weightIh: decode(file.weight_ih, 4 * H * 2 * S, 'weight_ih'),
    weightHh: decode(file.weight_hh, 4 * H * H, 'weight_hh'),
    bias: biasIh.map((b, i) => b + biasHh[i]),
    outWeight: decode(file.out_weight, S * H, 'out_weight'),
    outBias: decode(file.out_bias, S, 'out_bias'),
  }
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

export interface DktState { h: Float32Array; c: Float32Array }

export function initialDktState(model: DktModel): DktState {
  return { h: new Float32Array(model.H), c: new Float32Array(model.H) }
}

// Advances the LSTM by one interaction. Interactions on skills the model
// doesn't know leave the state unchanged.
export function stepDkt(model: DktModel, state: DktState, { skill_id, correct }: DktInteraction): DktState {
  const s = model.skillIndex.get(skill_id)
  if (s === undefined) return state
  const { H, weightIh, weightHh, bias, skills } = model
  const inputSize = 2 * skills.length
  const column = correct ? s : skills.length + s
  const gates = new Float32Array(4 * H)
  for (let r = 0; r < 4 * H; r++) {
    let sum = bias[r] + weightIh[r * inputSize + column]
    const row = r * H
    for (let k = 0; k < H; k++) sum += weightHh[row + k] * state.h[k]
    gates[r] = sum
  }
  const h = new Float32Array(H)
  const c = new Float32Array(H)
  for (let j = 0; j < H; j++) {
    const i = sigmoid(gates[j])
    const f = sigmoid(gates[H + j])
    const g = Math.tanh(gates[2 * H + j])
    const o = sigmoid(gates[3 * H + j])
    c[j] = f * state.c[j] + i * g
    h[j] = o * Math.tanh(c[j])
  }
  return { h, c }
}

// P(correct) on one skill's next attempt, from the current state.
export function predictSkill(model: DktModel, state: DktState, skillId: string): number | undefined {
  const s = model.skillIndex.get(skillId)
  if (s === undefined) return undefined
  let sum = model.outBias[s]
  const row = s * model.H
  for (let k = 0; k < model.H; k++) sum += model.outWeight[row + k] * state.h[k]
  return sigmoid(sum)
}

// Runs the LSTM over a learner's history and returns P(correct) for every
// skill on their *next* attempt. An empty history returns the model's
// cold-start output (all-zero state), matching an untouched LSTM.
export function predictNext(model: DktModel, history: DktInteraction[]): Map<string, number> {
  const state = history.reduce((st, interaction) => stepDkt(model, st, interaction), initialDktState(model))
  return new Map(model.skills.map(skill => [skill, predictSkill(model, state, skill)!]))
}
