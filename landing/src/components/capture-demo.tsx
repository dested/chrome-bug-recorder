import '~/styles/demo.css'

// A looping, pure-CSS recreation of one Gripe capture: the picker snaps onto
// a button, dictation types itself out, the drain bar runs down, the note
// commits. Every element shares one 16s animation clock — see demo.css.
export function CaptureDemo() {
  return (
    <div className="demo" aria-hidden="true">
      <div className="demo-titlebar">
        <span className="demo-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="demo-url">localhost:3000/checkout</span>
      </div>

      <div className="demo-app">
        <h4>Checkout</h4>
        <div className="demo-rows">
          <div className="demo-row">
            <span>
              <b>Field notes tee</b> · black / M
            </span>
            <span className="demo-price">$28.00</span>
          </div>
          <div className="demo-row">
            <span>Shipping</span>
            <span className="demo-price">$4.00</span>
          </div>
          <div className="demo-row">
            <span>
              <b>Total</b>
            </span>
            <span className="demo-price">$32.00</span>
          </div>
        </div>
        <div className="demo-cta-row">
          <span className="demo-target">
            <span className="demo-highlight" />
            <span className="demo-tag">#submit</span>
            <span className="demo-button">Place order</span>
          </span>
        </div>
      </div>

      <div className="demo-hint">
        <span className="demo-live-dot" />
        <span>click what&rsquo;s wrong</span>
        <kbd>E</kbd>
        <kbd>R</kbd>
        <kbd>D</kbd>
        <kbd>P</kbd>
        <kbd>esc</kbd>
      </div>

      <svg className="demo-cursor" width="20" height="22" viewBox="0 0 20 22" fill="none">
        <path
          d="M3 1.5L16.5 12.5L10 13.5L13 20L10 21.5L7 14.5L3 18.5V1.5Z"
          fill="#f2efec"
          stroke="#0a0a0c"
          strokeWidth="1.4"
        />
      </svg>

      <div className="demo-composer">
        <div className="demo-composer-top">
          <span className="demo-mic" />
          <span className="demo-transcript">
            place order does nothing the second time i click it
          </span>
          <span className="demo-caret" />
        </div>
        <div className="demo-composer-meta">
          <span className="demo-sel">#submit</span>
          <span>&ldquo;Place order&rdquo;</span>
          <span>14:32:11</span>
          <span>2 console events</span>
        </div>
        <span className="demo-drain" />
      </div>

      <div className="demo-toast">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.2L4.8 9L10 3.2" stroke="#0a0a0c" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span>note 1 saved</span>
        <span className="demo-file">01-full.png · 01-target.png</span>
      </div>
    </div>
  )
}
