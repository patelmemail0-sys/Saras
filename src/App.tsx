import './App.css'

function App() {
  return (
    <main className="shell">
      <div className="mark" aria-hidden="true">
        <span className="ray ray-1" />
        <span className="ray ray-2" />
        <span className="ray ray-3" />
      </div>

      <h1 className="wordmark">Saaras</h1>
      <p className="tagline">
        One concept, seen three ways. Paste a STEM idea, formula, or problem and
        watch it become interactive visuals you can actually play with.
      </p>

      <p className="status">
        Pre-product. Design and architecture live in{' '}
        <code>docs/DESIGN.md</code>.
      </p>
    </main>
  )
}

export default App
