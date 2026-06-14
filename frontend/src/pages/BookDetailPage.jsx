import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ProgressBar from '../components/ProgressBar';
import StarRating from '../components/StarRating';
import Toast from '../components/Toast';

/** Check if Open Library title is an exact match with the displayed book title. */
function _isTitleMatch(bookTitle, olTitle) {
  if (!bookTitle || !olTitle) return false;
  return bookTitle.toLowerCase().trim() === olTitle.toLowerCase().trim();
}

export default function BookDetailPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [book, setBook] = useState(state?.book || null);
  const [shelfEntry, setShelfEntry] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [toast, setToast] = useState(null);

  // Session form
  const [sessionForm, setSessionForm] = useState({ pages_read: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  // Review form
  const [reviewForm, setReviewForm] = useState({ rating: 0, review_text: '' });
  // Open Library availability
  const [olData, setOlData] = useState(null);
  const [olLoading, setOlLoading] = useState(false);

  useEffect(() => {
    // Fetch reviews
    api.get(`reviews/?book=${id}`)
      .then(res => {
        setReviews(res.data.reviews || []);
        setAvgRating(res.data.average_rating || 0);
      })
      .catch(console.error);

    // Fetch shelf entry for this book
    if (user) {
      api.get('shelf/')
        .then(res => {
          const entry = res.data.find(b => b.google_book_id === id);
          setShelfEntry(entry || null);
          if (entry) {
            api.get(`tracker/?book=${entry.id}`)
              .then(r => setSessions(r.data))
              .catch(console.error);
          }
        })
        .catch(console.error);
    }
  }, [id, user]);

  // Fetch Open Library availability
  useEffect(() => {
    if (!book) return;
    setOlLoading(true);
    const params = new URLSearchParams({ title: book.title });
    if (book.authors) params.append('author', book.authors);
    api.get(`books/open-library/?${params.toString()}`)
      .then(res => setOlData(res.data))
      .catch(() => setOlData(null))
      .finally(() => setOlLoading(false));
  }, [book]);

  const handleAddToShelf = async () => {
    try {
      const res = await api.post('shelf/', {
        google_book_id: book.google_book_id || id,
        title: book.title,
        authors: book.authors,
        thumbnail: book.thumbnail,
        page_count: book.page_count || 0,
        categories: book.categories || '',
        status: 'want_to_read',
      });
      setShelfEntry(res.data);
      setToast({ message: 'Added to shelf!', type: 'success' });
    } catch {
      setToast({ message: 'Already on your shelf', type: 'error' });
    }
  };

  const handleStatusChange = async (newStatus) => {
    await api.patch(`shelf/${shelfEntry.id}/`, { status: newStatus });
    setShelfEntry(prev => ({ ...prev, status: newStatus }));
    setToast({ message: 'Status updated!', type: 'success' });
  };

  const handleLogSession = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('tracker/', {
        user_book: shelfEntry.id,
        pages_read: parseInt(sessionForm.pages_read),
        date: sessionForm.date,
        notes: sessionForm.notes,
      });
      setSessions(prev => [res.data, ...prev]);
      setShelfEntry(prev => ({
        ...prev,
        total_pages_read: res.data.total_pages_read,
        progress_percent: res.data.progress_percent,
      }));
      setSessionForm({ pages_read: '', date: new Date().toISOString().slice(0, 10), notes: '' });
      setToast({ message: `Logged ${sessionForm.pages_read} pages!`, type: 'success' });
    } catch {
      setToast({ message: 'Failed to log session', type: 'error' });
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!reviewForm.rating) return setToast({ message: 'Please select a rating', type: 'error' });
    try {
      const res = await api.post('reviews/', {
        google_book_id: id,
        book_title: book?.title || '',
        rating: reviewForm.rating,
        review_text: reviewForm.review_text,
      });
      setReviews(prev => [res.data, ...prev.filter(r => r.username !== user?.username)]);
      setReviewForm({ rating: 0, review_text: '' });
      setToast({ message: 'Review submitted!', type: 'success' });
    } catch {
      setToast({ message: 'Failed to submit review', type: 'error' });
    }
  };

  if (!book) return (
    <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📖</div>
      <p>Book information not available. Please go back and click through a book card.</p>
    </div>
  );

  const thumbnail = book.thumbnail || '';
  const progressPct = shelfEntry?.progress_percent || 0;

  return (
    <div className="page-enter">
      {/* Hero */}
      <div className="book-detail-hero">
        {/* Cover */}
        <div className="book-detail-cover">
          {thumbnail ? (
            <img src={thumbnail} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem', background: 'var(--gradient-primary)' }}>
              📖
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '0.5rem' }}>
            {book.title}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '0.75rem', fontWeight: 500 }}>
            {book.authors}
          </p>

          {/* Meta */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {book.published_date && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                📅 {book.published_date}
              </span>
            )}
            {book.page_count > 0 && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                📄 {book.page_count} pages
              </span>
            )}
            {book.categories && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                🏷️ {book.categories}
              </span>
            )}
          </div>

          {/* Avg rating */}
          {avgRating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <StarRating value={Math.round(avgRating)} readOnly size={18} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {avgRating}/5 ({reviews.length} reviews)
              </span>
            </div>
          )}

          {/* Shelf action */}
          {user && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              {shelfEntry ? (
                <select
                  value={shelfEntry.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  style={{
                    padding: '0.65rem 1rem', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)', color: 'var(--text-primary)',
                    border: '1px solid var(--border)', fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >
                  <option value="want_to_read">🔖 Want to Read</option>
                  <option value="reading">📖 Reading</option>
                  <option value="completed">✅ Completed</option>
                </select>
              ) : (
                <button onClick={handleAddToShelf} className="btn-primary">
                  + Add to Shelf
                </button>
              )}

              {/* Read Book button */}
              {olLoading ? (
                <button disabled className="btn-secondary" style={{ opacity: 0.5, cursor: 'wait', fontSize: '0.9rem' }}>
                  Checking availability...
                </button>
              ) : olData?.available && _isTitleMatch(book.title, olData.ol_title) ? (
                <button
                  id="read-book-btn"
                  onClick={() => navigate(`/read/${id}`, {
                    state: {
                      title: olData.ol_title || book.title,
                      authors: book.authors,
                      readUrl: olData.read_url,
                      ebookAccess: olData.ebook_access,
                    }
                  })}
                  style={{
                    padding: '0.65rem 1.25rem', borderRadius: 'var(--radius-md)',
                    border: 'none', cursor: 'pointer', fontSize: '0.9rem',
                    fontWeight: 600, transition: 'all 0.2s ease',
                    background: 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)',
                    color: '#0f0f1a', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 212, 170, 0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  title={olData.ol_title !== book.title ? `Opens: ${olData.ol_title}` : ''}
                >
                  📖 Read Book
                </button>
              ) : null}
            </div>
          )}

          {/* Read Book for non-logged-in users */}
          {!user && olData?.available && _isTitleMatch(book.title, olData.ol_title) && (
            <div style={{ marginBottom: '1.25rem' }}>
              <button
                onClick={() => navigate(`/read/${id}`, {
                  state: {
                    title: olData.ol_title || book.title,
                    authors: book.authors,
                    readUrl: olData.read_url,
                    ebookAccess: olData.ebook_access,
                  }
                })}
                style={{
                  padding: '0.65rem 1.25rem', borderRadius: 'var(--radius-md)',
                  border: 'none', cursor: 'pointer', fontSize: '0.9rem',
                  fontWeight: 600, transition: 'all 0.2s ease',
                  background: 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)',
                  color: '#0f0f1a', display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 212, 170, 0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                title={olData.ol_title !== book.title ? `Opens: ${olData.ol_title}` : ''}
              >
                📖 Read Book
              </button>
            </div>
          )}

          {/* Progress */}
          {shelfEntry && book.page_count > 0 && (
            <div style={{ maxWidth: 400 }}>
              <ProgressBar
                percent={progressPct}
                label={`${shelfEntry.total_pages_read || 0} / ${book.page_count} pages read`}
              />
            </div>
          )}

          {/* Description */}
          {book.description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, marginTop: '1rem', maxWidth: 600 }}>
              {book.description.length > 400 ? book.description.slice(0, 400) + '...' : book.description}
            </p>
          )}
        </div>
      </div>

      <div className="book-detail-columns">
        {/* Log Reading Session */}
        {shelfEntry && (
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
              📝 Log Reading Session
            </h3>
            <form onSubmit={handleLogSession} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Pages Read
                </label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="50"
                  value={sessionForm.pages_read}
                  onChange={e => setSessionForm({ ...sessionForm, pages_read: e.target.value })}
                  min={1}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Date
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={sessionForm.date}
                  onChange={e => setSessionForm({ ...sessionForm, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Notes (optional)
                </label>
                <textarea
                  className="input-field"
                  placeholder="What did you think?"
                  value={sessionForm.notes}
                  onChange={e => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <button type="submit" className="btn-primary">Log Session</button>
            </form>

            {/* Session history */}
            {sessions.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  History
                </h4>
                {sessions.slice(0, 5).map(s => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.83rem'
                  }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.pages_read} pages</span>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(s.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reviews */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>⭐ Reviews</h3>

          {/* Submit review form */}
          {user && (
            <form onSubmit={handleSubmitReview} style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Your Rating
              </p>
              <StarRating value={reviewForm.rating} onChange={r => setReviewForm({ ...reviewForm, rating: r })} />
              <textarea
                className="input-field"
                placeholder="Write your review..."
                value={reviewForm.review_text}
                onChange={e => setReviewForm({ ...reviewForm, review_text: e.target.value })}
                rows={3}
                style={{ resize: 'vertical', marginTop: '0.75rem' }}
              />
              <button type="submit" className="btn-primary" style={{ marginTop: '0.75rem', padding: '0.6rem 1.25rem', fontSize: '0.88rem' }}>
                Submit Review
              </button>
            </form>
          )}

          {/* Review list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: 400, overflowY: 'auto' }}>
            {reviews.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>
                No reviews yet. Be the first!
              </p>
            ) : reviews.map(r => (
              <div key={r.id} style={{ padding: '0.875rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{r.username}</span>
                  <StarRating value={r.rating} readOnly size={14} />
                </div>
                {r.review_text && (
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {r.review_text}
                  </p>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
