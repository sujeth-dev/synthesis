// DKT inference in the browser.
//
// Ported from src/lib/dkt/index.ts in the Synaptic app (stepDkt,
// predictSkill, predictNext), unchanged in maths. Differences: base64 is
// decoded with atob (no Node Buffer in the browser), skill ids are generic
// strings, and stepDkt can also return the gate activations so the
// explainer can show them. Weights: "synaptic-dkt-v1" format written by
// dkt-lab/pipeline/dkt.py (same as Research/dkt/export_weights.py).

export interface DktWeightsFile {
  format: 'synaptic-dkt-v1'
  synthetic: boolean
  skills: string[]
  hidden_size: number
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
  skills: string[]
  skillIndex: Map<string, number>
  H: number
  weightIh: Float32Array
  weightHh: Float32Array
  bias: Float32Array          // bias_ih + bias_hh, pre-summed
  outWeight: Float32Array
  outBias: Float32Array
}

export interface DktInteraction { skill: string; correct: boolean }
export interface DktState { h: Float32Array; c: Float32Array }

function decode(b64: string, expectedLength: number, name: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const values = new Float32Array(bytes.buffer)
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

export function initialDktState(model: DktModel): DktState {
  return { h: new Float32Array(model.H), c: new Float32Array(model.H) }
}

// Advances the LSTM by one interaction. Unknown skills leave the state unchanged.
export function stepDkt(model: DktModel, state: DktState, { skill, correct }: DktInteraction): DktState {
  const s = model.skillIndex.get(skill)
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
export function predictSkill(model: DktModel, state: DktState, skill: string): number | undefined {
  const s = model.skillIndex.get(skill)
  if (s === undefined) return undefined
  return predictIndex(model, state, s)
}

export function predictIndex(model: DktModel, state: DktState, s: number): number {
  let sum = model.outBias[s]
  const row = s * model.H
  for (let k = 0; k < model.H; k++) sum += model.outWeight[row + k] * state.h[k]
  return sigmoid(sum)
}

// P(correct) for every skill (in model.skills order) from the current state.
export function predictAll(model: DktModel, state: DktState): Float64Array {
  const out = new Float64Array(model.skills.length)
  for (let s = 0; s < out.length; s++) out[s] = predictIndex(model, state, s)
  return out
}

// Runs the LSTM over a history and returns P(correct) for every skill on the
// next attempt. Empty history = cold start (all-zero state).
export function predictNext(model: DktModel, history: DktInteraction[]): Map<string, number> {
  const state = history.reduce((st, x) => stepDkt(model, st, x), initialDktState(model))
  return new Map(model.skills.map(skill => [skill, predictSkill(model, state, skill)!]))
}
