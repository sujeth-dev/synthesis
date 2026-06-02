'use client'
import { useEffect, useState, useRef } from 'react'

/* ─── Data ─────────────────────────────────────────────────────────────── */

const EMAIL    = 'jordan@demo.com'
const PASS_LEN = 8
const STATS    = { mastered: 36, learning: 7, streak: 15, urgent: 4 }

const PHASE_SKILLS = [
  { label: 'What is AI?',            mastery: 'mastered', p: 90 },
  { label: 'AI vs ML vs DL',         mastery: 'mastered', p: 88 },
  { label: 'History of AI',          mastery: 'mastered', p: 85 },
  { label: 'How Machines Learn',     mastery: 'mastered', p: 83 },
  { label: 'Types of Learning',      mastery: 'learning', p: 72 },
  { label: 'Training vs Inference',  mastery: 'learning', p: 65 },
  { label: 'Data & Labels',          mastery: 'learning', p: 58 },
]

const Q = {
  skill:   'Types of Learning',
  pBefore: 72, pAfter: 79, interval: 3,
  text:    'What does supervised learning require that unsupervised learning does not?',
  options: [
    'A dedicated GPU cluster for parallel computation',
    'Labelled training examples with known correct answers',
    'A local Python development environment',
    'Dimensionality reduction as a preprocessing step',
  ],
  correct: 1,
}

const MC: Record<string, string> = {
  mastered: '#34d399', learning: '#7c6eff', fragile: '#fbbf24', blocked: '#3a3a52',
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

type Scene = 'login' | 'dashboard' | 'question' | 'result'

function makeSleep(ref: React.MutableRefObject<boolean>) {
  return (ms: number) => new Promise<void>((resolve, reject) =>
    setTimeout(() => ref.current ? reject(new Error('x')) : resolve(), ms)
  )
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default function DemoPage() {
  const cancelRef = useRef(false)

  const [scene,    setScene]    = useState<Scene>('login')
  const [sceneIdx, setSceneIdx] = useState(0)
  const [fade,     setFade]     = useState(0)

  // Login
  const [emailN,  setEmailN]  = useState(0)
  const [passN,   setPassN]   = useState(0)
  const [loading, setLoading] = useState(false)

  // Dashboard
  const [mastN,    setMastN]    = useState(0)
  const [learnN,   setLearnN]   = useState(0)
  const [barW,     setBarW]     = useState(0)
  const [visSkill, setVisSkill] = useState(0)

  // Question
  const [visOpt, setVisOpt] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)

  // Result
  const [bktPct,    setBktPct]    = useState(Q.pBefore)
  const [showDelta, setShowDelta] = useState(false)
  const [showSm2,   setShowSm2]   = useState(false)

  useEffect(() => {
    cancelRef.current = false
    const sleep = makeSleep(cancelRef)

    async function run() {
      try {
        while (!cancelRef.current) {

          // ── LOGIN ──────────────────────────────────────────────────
          setScene('login'); setSceneIdx(0)
          setEmailN(0); setPassN(0); setLoading(false)
          setFade(0); await sleep(200); setFade(1)
          await sleep(550)
          for (let i = 1; i <= EMAIL.length; i++) { setEmailN(i); await sleep(70) }
          await sleep(320)
          for (let i = 1; i <= PASS_LEN; i++) { setPassN(i); await sleep(55) }
          await sleep(460); setLoading(true); await sleep(980)

          // ── DASHBOARD ─────────────────────────────────────────────
          setScene('dashboard'); setSceneIdx(1)
          setMastN(0); setLearnN(0); setBarW(0); setVisSkill(0)
          setFade(0); await sleep(200); setFade(1)
          for (let i = 0; i <= STATS.mastered; i += 2) { setMastN(Math.min(i, STATS.mastered)); await sleep(18) }
          setMastN(STATS.mastered)
          for (let i = 0; i <= STATS.learning; i++) { setLearnN(i); await sleep(50) }
          for (let w = 0; w <= 33; w++) { setBarW(w); await sleep(15) }
          for (let k = 1; k <= PHASE_SKILLS.length; k++) { setVisSkill(k); await sleep(130) }
          await sleep(2000)

          // ── QUESTION ──────────────────────────────────────────────
          setScene('question'); setSceneIdx(2)
          setVisOpt(0); setPicked(null)
          setFade(0); await sleep(200); setFade(1); await sleep(450)
          for (let i = 1; i <= Q.options.length; i++) { setVisOpt(i); await sleep(260) }
          await sleep(1500); setPicked(Q.correct); await sleep(950)

          // ── RESULT ────────────────────────────────────────────────
          setScene('result'); setSceneIdx(3)
          setBktPct(Q.pBefore); setShowDelta(false); setShowSm2(false)
          setFade(0); await sleep(200); setFade(1); await sleep(380)
          for (let p = Q.pBefore; p <= Q.pAfter; p++) { setBktPct(p); await sleep(88) }
          await sleep(260); setShowDelta(true)
          await sleep(880); setShowSm2(true)
          await sleep(2900)
        }
      } catch { /* cancelled */ }
    }

    run()
    return () => { cancelRef.current = true }
  }, [])

  return (
    <>
      <style>{`
        @keyframes spin   { to { transform:rotate(360deg) } }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes glow   { 0%,100%{opacity:1;box-shadow:0 0 5px #34d399} 50%{opacity:.5;box-shadow:0 0 12px #34d399} }
        @keyframes pop    { 0%{transform:scale(.86);opacity:0} 60%{transform:scale(1.04)} 100%{transform:scale(1);opacity:1} }
        @keyframes drift  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
      `}</style>

      <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', display:'flex', flexDirection:'column' }}>

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <header style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'13px 24px', borderBottom:'1px solid var(--border)',
          background:'var(--bg2)', flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ color:'var(--purple)', fontSize:17 }}>◆</span>
            <span style={{ fontFamily:'ui-serif,Georgia,serif', fontStyle:'italic', fontSize:17, color:'var(--text)' }}>
              synaptic
            </span>
            <span style={{
              fontFamily:'ui-monospace,monospace', fontSize:10, color:'var(--text-ghost)',
              background:'var(--bg3)', padding:'2px 9px', borderRadius:20,
              border:'1px solid var(--border)', letterSpacing:'0.08em',
            }}>
              adaptive AI learning
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{
              width:7, height:7, borderRadius:'50%', background:'#34d399',
              display:'inline-block', animation:'glow 2s ease-in-out infinite',
            }}/>
            <span style={{ fontFamily:'ui-monospace,monospace', fontSize:10, color:'var(--text-faint)', letterSpacing:'0.12em' }}>
              LIVE DEMO
            </span>
          </div>
        </header>

        {/* ── Scene ───────────────────────────────────────────────────── */}
        <main style={{
          flex:1, display:'flex', alignItems:'center', justifyContent:'center',
          padding:'28px 20px', opacity:fade, transition:'opacity 0.3s ease',
        }}>
          {scene === 'login'     && <LoginScene     emailN={emailN} passN={passN} loading={loading} />}
          {scene === 'dashboard' && <DashboardScene mastN={mastN} learnN={learnN} barW={barW} visSkill={visSkill} />}
          {scene === 'question'  && <QuestionScene  visOpt={visOpt} picked={picked} />}
          {scene === 'result'    && <ResultScene    bktPct={bktPct} showDelta={showDelta} showSm2={showSm2} />}
        </main>

        {/* ── Bottom bar ──────────────────────────────────────────────── */}
        <footer style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'11px 24px', borderTop:'1px solid var(--border)',
          background:'var(--bg2)', flexShrink:0,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            {['Login','Dashboard','Practice','Result'].map((lbl, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{
                  height:6, borderRadius:3, transition:'all 0.4s ease',
                  width: i === sceneIdx ? 22 : 6,
                  background: i === sceneIdx ? 'var(--purple)' : i < sceneIdx ? '#34d39950' : 'var(--border-hi)',
                }}/>
                <span style={{
                  fontFamily:'ui-monospace,monospace', fontSize:10, letterSpacing:'0.06em',
                  color: i === sceneIdx ? 'var(--text-muted)' : 'var(--text-ghost)',
                  transition:'color 0.3s',
                }}>
                  {lbl}
                </span>
              </div>
            ))}
          </div>
          <a href="/login" target="_top" style={{
            fontFamily:'ui-monospace,monospace', fontSize:12,
            color:'var(--purple)', textDecoration:'none',
            border:'1px solid var(--purple)60', borderRadius:8, padding:'5px 14px',
          }}>
            Try it free →
          </a>
        </footer>

      </div>
    </>
  )
}

/* ─── Scene: Login ──────────────────────────────────────────────────────── */

function LoginScene({ emailN, passN, loading }: { emailN:number; passN:number; loading:boolean }) {
  return (
    <div style={{ width:'100%', maxWidth:380 }}>
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ fontFamily:'ui-serif,Georgia,serif', fontStyle:'italic', fontSize:30, color:'var(--text)', marginBottom:6 }}>
          <span style={{ color:'var(--purple)' }}>◆</span> synaptic
        </div>
        <p style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:'var(--text-faint)' }}>
          Adaptive learning engine for AI
        </p>
      </div>

      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'26px 24px' }}>
        <p style={{ fontFamily:'ui-monospace,monospace', fontSize:10, color:'var(--text-ghost)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:18 }}>
          Sign in
        </p>

        <div style={{ marginBottom:12 }}>
          <div style={{
            background:'var(--bg3)', border:'1px solid var(--border-hi)',
            borderRadius:10, padding:'11px 14px', minHeight:44,
            display:'flex', alignItems:'center',
            fontFamily:'ui-monospace,monospace', fontSize:13, color:'var(--text)',
          }}>
            {emailN > 0
              ? <>{EMAIL.slice(0, emailN)}{!loading && emailN < EMAIL.length && (
                  <span style={{ width:2, height:14, background:'var(--purple)', display:'inline-block', marginLeft:1, animation:'blink 0.9s step-end infinite' }}/>
                )}</>
              : <span style={{ color:'var(--text-ghost)', opacity:.5 }}>Email address</span>
            }
          </div>
        </div>

        <div style={{ marginBottom:20 }}>
          <div style={{
            background:'var(--bg3)', border:'1px solid var(--border-hi)',
            borderRadius:10, padding:'11px 14px', minHeight:44,
            display:'flex', alignItems:'center',
            fontFamily:'ui-monospace,monospace', fontSize:18, letterSpacing:'0.2em', color:'var(--text)',
          }}>
            {passN > 0
              ? '•'.repeat(passN)
              : <span style={{ fontSize:13, color:'var(--text-ghost)', letterSpacing:'normal', opacity:.5 }}>Password</span>
            }
          </div>
        </div>

        <div style={{
          width:'100%', padding:'12px', borderRadius:10, border:'none', cursor:'default',
          background: loading ? 'var(--bg3)' : passN === PASS_LEN ? 'var(--purple)' : 'var(--bg3)',
          color: loading ? 'var(--text-faint)' : passN === PASS_LEN ? 'white' : 'var(--text-ghost)',
          fontFamily:'ui-monospace,monospace', fontSize:13, fontWeight:600,
          transition:'all 0.3s ease', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        }}>
          {loading
            ? <><span style={{ width:13, height:13, border:'2px solid var(--border-hi)', borderTopColor:'var(--purple)', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Signing in...</>
            : 'Sign in →'
          }
        </div>
      </div>
    </div>
  )
}

/* ─── Scene: Dashboard ──────────────────────────────────────────────────── */

function DashboardScene({ mastN, learnN, barW, visSkill }: { mastN:number; learnN:number; barW:number; visSkill:number }) {
  return (
    <div style={{ width:'100%', maxWidth:680 }}>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <h1 style={{ fontFamily:'ui-serif,Georgia,serif', fontStyle:'italic', fontSize:24, color:'var(--text)', marginBottom:4, lineHeight:1 }}>
            Hi, Jordan Park
          </h1>
          <p style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:'var(--text-faint)' }}>
            {STATS.urgent} urgent reviews · <span style={{ color:'var(--yellow)' }}>🔥 {STATS.streak} day streak</span>
          </p>
        </div>
        <div style={{
          padding:'9px 18px', background:'var(--purple)', color:'white',
          borderRadius:10, fontFamily:'ui-monospace,monospace', fontSize:13, fontWeight:600, flexShrink:0,
        }}>
          Continue Phase 3 →
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
        {[
          { val:mastN,        lbl:'Skills mastered',   col:'#34d399' },
          { val:learnN,       lbl:'Actively learning', col:'var(--purple)' },
          { val:STATS.urgent, lbl:'Urgent reviews',    col:'var(--yellow)' },
        ].map((s, i) => (
          <div key={i} style={{
            padding:'14px 16px', background:'var(--bg2)',
            border:'1px solid var(--border)', borderLeft:`3px solid ${s.col}`, borderRadius:12,
          }}>
            <p style={{ fontFamily:'ui-serif,Georgia,serif', fontSize:30, color:s.col, lineHeight:1, marginBottom:5 }}>{s.val}</p>
            <p style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>{s.lbl}</p>
          </div>
        ))}
      </div>

      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'18px 20px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
          <span style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--purple)', textTransform:'uppercase', letterSpacing:'0.16em' }}>
            Active phase
          </span>
          <span style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:'var(--text-faint)' }}>
            4 / 12 mastered
          </span>
        </div>
        <h2 style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:10 }}>
          Phase 3 — Intro to AI
        </h2>

        <div style={{ height:7, borderRadius:4, background:'var(--bg3)', overflow:'hidden', marginBottom:14 }}>
          <div style={{ height:'100%', width:`${barW}%`, background:'var(--purple)', borderRadius:4, transition:'width 0.08s linear' }}/>
        </div>

        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:2 }}>
          {PHASE_SKILLS.map((s, i) => {
            const vis = i < visSkill
            const c   = MC[s.mastery] ?? '#3a3a52'
            return (
              <div key={i} style={{
                flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:5,
                opacity:vis ? 1 : 0, transform: vis ? 'translateY(0)' : 'translateY(8px)',
                transition:'opacity 0.3s, transform 0.3s',
              }}>
                <div style={{
                  width:46, height:46, borderRadius:'50%',
                  background:c + '22', border:`2px solid ${c}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {s.mastery === 'mastered'
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <span style={{ fontFamily:'ui-monospace,monospace', fontSize:10, fontWeight:700, color:c }}>{s.p}%</span>
                  }
                </div>
                <p style={{ fontFamily:'ui-monospace,monospace', fontSize:8, color:'var(--text-faint)', textAlign:'center', maxWidth:56, lineHeight:1.35 }}>
                  {s.label}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Scene: Question ───────────────────────────────────────────────────── */

function QuestionScene({ visOpt, picked }: { visOpt:number; picked:number|null }) {
  return (
    <div style={{ width:'100%', maxWidth:680, display:'flex', gap:14, flexWrap:'wrap' }}>

      {/* BKT state panel */}
      <div style={{ flex:'0 0 188px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'18px' }}>
        <p style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--purple)', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:10 }}>
          BKT state
        </p>
        <p style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:'var(--text-muted)', marginBottom:14, lineHeight:1.45 }}>
          {Q.skill}
        </p>

        <p style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--text-ghost)', marginBottom:5 }}>p_know</p>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
          <div style={{ flex:1, height:6, borderRadius:3, background:'var(--bg3)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Q.pBefore}%`, background:'var(--purple)', borderRadius:3 }}/>
          </div>
          <span style={{ fontFamily:'ui-monospace,monospace', fontSize:14, fontWeight:700, color:'var(--purple)', flexShrink:0 }}>
            {Q.pBefore}%
          </span>
        </div>

        <div style={{
          display:'inline-flex', padding:'2px 8px',
          background:'#7c6eff18', border:'1px solid #7c6eff40',
          borderRadius:20, fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--purple)',
          marginBottom:14,
        }}>
          mastery: learning
        </div>

        <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
          <p style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--text-ghost)', lineHeight:1.65 }}>
            Weakest active skill selected to maximise knowledge gain this session.
          </p>
        </div>
      </div>

      {/* Question card */}
      <div style={{ flex:1, minWidth:280, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px' }}>
        <p style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--text-ghost)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12 }}>
          Question
        </p>
        <p style={{ fontSize:14, color:'var(--text)', lineHeight:1.6, marginBottom:18, fontWeight:500 }}>
          {Q.text}
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {Q.options.map((opt, i) => {
            const vis = i < visOpt
            const sel = picked === i
            return (
              <div key={i} style={{
                padding:'10px 14px', borderRadius:10, cursor:'default',
                background: sel ? '#7c6eff20' : 'var(--bg3)',
                border: `1px solid ${sel ? 'var(--purple)' : 'var(--border)'}`,
                display:'flex', alignItems:'center', gap:10,
                opacity:vis ? 1 : 0, transform: vis ? 'translateX(0)' : 'translateX(-8px)',
                transition:'opacity 0.22s, transform 0.22s, background 0.2s, border-color 0.2s',
              }}>
                <div style={{
                  width:18, height:18, borderRadius:'50%', flexShrink:0,
                  border: `2px solid ${sel ? 'var(--purple)' : 'var(--border-hi)'}`,
                  background: sel ? 'var(--purple)' : 'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {sel && <div style={{ width:7, height:7, borderRadius:'50%', background:'white' }}/>}
                </div>
                <span style={{ fontSize:12, lineHeight:1.4, color: sel ? 'var(--text)' : 'var(--text-muted)' }}>
                  {opt}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Scene: Result ─────────────────────────────────────────────────────── */

function ResultScene({ bktPct, showDelta, showSm2 }: { bktPct:number; showDelta:boolean; showSm2:boolean }) {
  return (
    <div style={{ width:'100%', maxWidth:520 }}>

      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:22, animation:'pop 0.4s ease forwards' }}>
        <div style={{
          width:38, height:38, borderRadius:'50%',
          background:'#34d39922', border:'2px solid #34d399',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div>
          <p style={{ fontSize:18, fontWeight:700, color:'#34d399', marginBottom:3 }}>Correct</p>
          <p style={{ fontFamily:'ui-monospace,monospace', fontSize:11, color:'var(--text-faint)' }}>
            Labelled training examples with known correct answers
          </p>
        </div>
      </div>

      {/* BKT card */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'20px 22px', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <span style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--text-ghost)', textTransform:'uppercase', letterSpacing:'0.14em' }}>
            Bayesian Knowledge Tracing — update
          </span>
          {showDelta && (
            <span style={{
              fontFamily:'ui-monospace,monospace', fontSize:11, color:'#34d399',
              background:'#34d39912', border:'1px solid #34d39935',
              borderRadius:20, padding:'2px 9px', animation:'pop 0.3s ease forwards',
            }}>
              Δ +{Q.pAfter - Q.pBefore}% p_know
            </span>
          )}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
          <span style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--text-ghost)', width:48, flexShrink:0 }}>
            p_know
          </span>
          <div style={{ flex:1, height:10, borderRadius:5, background:'var(--bg3)', overflow:'hidden' }}>
            <div style={{
              height:'100%', width:`${bktPct}%`,
              background:'linear-gradient(90deg, var(--purple) 0%, #34d399 100%)',
              borderRadius:5, transition:'width 0.08s linear',
            }}/>
          </div>
          <span style={{ fontFamily:'ui-monospace,monospace', fontSize:16, fontWeight:700, color:'var(--purple)', width:38, textAlign:'right', flexShrink:0 }}>
            {bktPct}%
          </span>
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {[
            { t:`before: ${Q.pBefore}%`, c:'var(--text-ghost)', bg:'var(--bg3)',   bc:'var(--border)' },
            { t:'→',                      c:'var(--text-ghost)', bg:'transparent', bc:'transparent' },
            { t:`after: ${bktPct}%`,      c:'#34d399',           bg:'#34d39910',  bc:'#34d39930' },
          ].map((x, i) => (
            <span key={i} style={{
              fontFamily:'ui-monospace,monospace', fontSize:10, color:x.c,
              background:x.bg, border:`1px solid ${x.bc}`,
              borderRadius:4, padding: x.bc === 'transparent' ? '0' : '2px 7px',
            }}>{x.t}</span>
          ))}
        </div>
      </div>

      {/* SM-2 card */}
      <div style={{
        background:'var(--bg2)', border:'1px solid var(--border)',
        borderRadius:16, padding:'16px 22px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        opacity: showSm2 ? 1 : 0,
        transform: showSm2 ? 'translateY(0)' : 'translateY(8px)',
        transition:'opacity 0.35s ease, transform 0.35s ease',
      }}>
        <div>
          <p style={{ fontFamily:'ui-monospace,monospace', fontSize:9, color:'var(--text-ghost)', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:7 }}>
            SM-2 Spaced Repetition — scheduled
          </p>
          <p style={{ fontFamily:'ui-monospace,monospace', fontSize:14, color:'var(--text-muted)' }}>
            Next review in{' '}
            <span style={{ color:'var(--yellow)', fontWeight:700 }}>{Q.interval} days</span>
          </p>
        </div>
        <div style={{ textAlign:'right' }}>
          <p style={{ fontFamily:'ui-monospace,monospace', fontSize:10, color:'var(--text-ghost)', marginBottom:3 }}>ease: 2.8</p>
          <p style={{ fontFamily:'ui-monospace,monospace', fontSize:10, color:'var(--text-ghost)' }}>repetitions: 5</p>
        </div>
      </div>

    </div>
  )
}
