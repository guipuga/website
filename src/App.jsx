import { useEffect } from 'react'
import ReviewModal from './components/ReviewModal'
import './App.css'

function App() {
  useEffect(() => {
    if (window.__skBootstrapped) return
    window.__skBootstrapped = true
    document.body.classList.add('is-booting')

    const load = async () => {
      await import('./js/data.js')
      await import('./js/contours.js')
      await import('./js/main.js')
      await import('./js/track.js')
      await import('./js/psp.js')
    }

    load()
  }, [])

  return (
    <>
      <div className="backdrop" aria-hidden="true"></div>

      <div id="boot" className="boot" role="status" aria-label="Loading">
        <div className="boot__name" aria-label="Guilherme Puga">
          Guilherme Puga
        </div>
        <div className="boot__bar">
          <span id="bootFill"></span>
        </div>
        <div className="boot__pct" id="bootPct">
          000
        </div>
      </div>

      <div className="ctl">
        <button className="ctl__b" id="invertToggle" aria-pressed="false">
          invert
        </button>
      </div>

      <main id="top">
        <section className="sec sec--dark hero" id="hero">
          <div className="stage" data-rise>
            <img src="/assets/el/star-a.png" alt="" className="el el--star-a" aria-hidden="true" />
            <img src="/assets/el/star-b.png" alt="" className="el el--star-b" aria-hidden="true" />
            <img src="/assets/el/dice.png" alt="" className="el el--dice" aria-hidden="true" />
            <h1 className="lay lay--guilherme">guilherme</h1>
            <p className="lay lay--puga" aria-hidden="true">
              puga.
            </p>
          </div>
          <a className="cue" href="#work" data-nav aria-label="Scroll to work">
            <i></i>
          </a>
        </section>

        <section className="sec sec--dark machine" id="work">
          <div className="stage" aria-hidden="true">
            <img src="/assets/el/flower.png" alt="" className="el el--flower" />
          </div>
          <div className="machine__stage">
            <canvas id="pspCanvas"></canvas>
            <div className="machine__loading" id="pspLoading">
              <i className="spin" aria-hidden="true"></i>
            </div>
          </div>
          <div className="rail" id="rail" aria-live="polite">
            <b id="railIdx">00</b>
            <i id="railTot">/00</i>
            <a className="rail__open" id="railOpen" href="#" target="_blank" rel="noopener" aria-label="Open this post">
              ↗
            </a>
          </div>
          <div className="keys" aria-hidden="true">
            <kbd>←</kbd>
            <kbd>→</kbd>
            <kbd>✕</kbd>
          </div>
        </section>

        <section className="sec sec--dark about" id="about">
          <div className="stage">
            <img src="/assets/el/cd-a.png" alt="" className="el el--cd-a" aria-hidden="true" />
            <img src="/assets/el/cd-b.png" alt="" className="el el--cd-b" aria-hidden="true" />
            <h2 className="lay lay--abouth">About me</h2>
            <img src="/assets/works/pfpgui.jpg" alt="Guilherme Puga" className="lay lay--photo" />
            <div className="lay lay--bio">
              <p>I&apos;m Guilherme Puga — a software developer based in Lisbon, Portugal.</p>
              <p>
                I specialize in building web applications and interactive experiences,
                with a focus on front-end development and artificial intelligence.
                I have a passion for creating intuitive and engaging interfaces that delight users and drive business success.
              </p>
            </div>
          </div>
        </section>

        <section className="sec sec--dark contact" id="contact">
          <div className="stage">
            <img src="/assets/el/cards.png" alt="" className="el el--cards" aria-hidden="true" />
            <h2 className="lay lay--contact">contact</h2>
            <p className="lay lay--me" aria-hidden="true">
              me.
            </p>
            <div className="lay lay--icons">
              <a href="mailto:pugadim123@gmail.com" aria-label="Email pugadim123@gmail.com">
                <img src="/assets/el/ic-mail.png" alt="" />
              </a>
              <a href="https://www.instagram.com/ufound.gui/" target="_blank" rel="noopener" aria-label="Instagram @ufound.gui">
                <img src="/assets/el/ic-ig.png" alt="" className="icons__ig" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <ReviewModal />
    </>
  )
}

export default App
