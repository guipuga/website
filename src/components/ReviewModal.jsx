import { useState, useEffect, useRef } from 'react'

export default function ReviewModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [author, setAuthor] = useState('')
  const [role, setRole] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [hoverRating, setHoverRating] = useState(0)
  const [status, setStatus] = useState('idle') // 'idle' | 'submitting' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    window.openReviewModal = () => {
      setAuthor('')
      setRole('')
      setRating(5)
      setComment('')
      setStatus('idle')
      setErrorMsg('')
      setIsOpen(true)
    }
    window.closeReviewModal = () => setIsOpen(false)

    return () => {
      delete window.openReviewModal
      delete window.closeReviewModal
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60)
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') setIsOpen(false)
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!author.trim()) {
      setErrorMsg('Please enter your name or identity.')
      return
    }
    if (!comment.trim()) {
      setErrorMsg('Please enter a review or feedback message.')
      return
    }

    setStatus('submitting')
    setErrorMsg('')

    try {
      if (typeof window.__skAddReview === 'function') {
        await window.__skAddReview({
          author: author.trim(),
          role: role.trim() || 'Visitor',
          rating: Number(rating) || 5,
          comment: comment.trim()
        })
      }
      setStatus('success')
      setTimeout(() => {
        setIsOpen(false)
      }, 750)
    } catch {
      setStatus('error')
      setErrorMsg('Could not save review. Please try again.')
    }
  }

  const ratingDescriptions = {
    1: '1/5 — Critical',
    2: '2/5 — Needs Work',
    3: '3/5 — Good',
    4: '4/5 — Very Good',
    5: '5/5 — Excellent'
  }

  return (
    <div className="rm-overlay" onClick={() => setIsOpen(false)}>
      <div
        className="rm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rm-title"
      >
        <div className="rm-header">
          <div className="rm-tag">[ SYSTEM // WRITE REVIEW ]</div>
          <button
            type="button"
            className="rm-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <h3 id="rm-title" className="rm-title">
          Write a Review
        </h3>
        <p className="rm-subtitle">
          Your feedback will appear live on the 3D PS Vita display and sync to the cloud database.
        </p>

        {status === 'success' ? (
          <div className="rm-success">
            <span className="rm-success-check">✓</span>
            <p className="rm-success-text">Review published successfully!</p>
            <span className="rm-success-hint">Now visible on the PS Vita screen</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rm-form">
            {errorMsg && <div className="rm-error">{errorMsg}</div>}

            <div className="rm-field">
              <label className="rm-label">SCORE // RATING</label>
              <div className="rm-stars-row">
                <div className="rm-stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`rm-star-btn ${star <= (hoverRating || rating) ? 'is-active' : ''}`}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      aria-label={`${star} star`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <span className="rm-star-desc">{ratingDescriptions[hoverRating || rating]}</span>
              </div>
            </div>

            <div className="rm-row">
              <div className="rm-field">
                <label className="rm-label">NAME // IDENTITY *</label>
                <input
                  ref={inputRef}
                  type="text"
                  className="rm-input"
                  placeholder="e.g. Sofia Ribeiro"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  maxLength={50}
                  disabled={status === 'submitting'}
                />
              </div>

              <div className="rm-field">
                <label className="rm-label">ROLE // CONTEXT</label>
                <input
                  type="text"
                  className="rm-input"
                  placeholder="e.g. Tech Lead, Designer, Peer"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  maxLength={50}
                  disabled={status === 'submitting'}
                />
              </div>
            </div>

            <div className="rm-field">
              <label className="rm-label">REVIEW // MESSAGE *</label>
              <textarea
                className="rm-textarea"
                rows={4}
                placeholder="Share your feedback, impressions, or project collaboration experience..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={300}
                disabled={status === 'submitting'}
              />
              <div className="rm-char-count">{comment.length} / 300</div>
            </div>

            <div className="rm-actions">
              <button
                type="button"
                className="rm-btn rm-btn--cancel"
                onClick={() => setIsOpen(false)}
                disabled={status === 'submitting'}
              >
                CANCEL
              </button>
              <button
                type="submit"
                className="rm-btn rm-btn--submit"
                disabled={status === 'submitting'}
              >
                {status === 'submitting' ? 'PUBLISHING...' : 'PUBLISH REVIEW ↗'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
