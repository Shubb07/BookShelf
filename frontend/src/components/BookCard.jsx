import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  want_to_read: 'Want to Read',
  reading: 'Reading',
  completed: 'Completed',
};

// Deterministic gradient from a title so coverless books still look like book covers
const COVER_GRADIENTS = [
  ['#5e6ad2', '#3b3f8f'], ['#10b981', '#065f46'], ['#f59e0b', '#b45309'],
  ['#ef4444', '#991b1b'], ['#8b5cf6', '#5b21b6'], ['#06b6d4', '#155e75'],
  ['#ec4899', '#9d174d'], ['#14b8a6', '#115e59'],
];
function gradientFor(title = '') {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
}

export const BookCardSkeleton = () => (
  <div className="book-card-wrapper">
    <div className="book-thumbnail-container shimmer" />
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 4px' }}>
      <div className="shimmer" style={{ height: '14px', width: '85%', borderRadius: '4px' }} />
      <div className="shimmer" style={{ height: '14px', width: '60%', borderRadius: '4px' }} />
      <div className="shimmer" style={{ height: '12px', width: '40%', borderRadius: '4px', marginTop: '4px' }} />
    </div>
  </div>
);

export default function BookCard({ book, onAddToShelf, shelfStatus, onStatusChange }) {
  const navigate = useNavigate();
  const thumbnail = book.thumbnail || book.imageLinks?.thumbnail || '';
  const title = book.title || 'Unknown Title';
  const authors = book.authors || 'Unknown Author';
  const googleBookId = book.google_book_id || book.id || book.googleBookId;
  const isOL = book.source === 'openlibrary';
  const isReadable = isOL && book.readable;
  
  // Use real progress from backend (total_pages_read / page_count); 0 if not yet tracked
  const progressPercent = book.progress_percent || 0;

  const handleClick = () => {
    navigate(`/book/${googleBookId}`, { state: { book } });
  };

  const handleRead = (e) => {
    e.stopPropagation();
    navigate(`/read/${googleBookId}`, {
      state: {
        title: book.title,
        authors: book.authors,
        readUrl: book.read_url,
        ebookAccess: book.ebook_access,
      }
    });
  };

  const handleShelfClick = (e) => {
    e.stopPropagation();
    if (onAddToShelf) {
      onAddToShelf(book);
    } else if (onStatusChange) {
      // In a premium UI, this would fire a sleek native context menu.
      // We will cycle through or jump to the detail page for management.
      const states = ['want_to_read', 'reading', 'completed'];
      const next = states[(states.indexOf(shelfStatus) + 1) % states.length];
      onStatusChange(next);
    }
  };

  return (
    <div className="book-card-wrapper" onClick={handleClick}>
      
      {/* Cover / Thumbnail Region */}
      <div className="book-thumbnail-container">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="book-thumbnail-image"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: '16px', textAlign: 'center',
            background: `linear-gradient(150deg, ${gradientFor(title)[0]} 0%, ${gradientFor(title)[1]} 100%)`,
          }}>
            <span style={{
              fontSize: '13px', fontWeight: 700, color: '#fff', lineHeight: 1.35,
              display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}>
              {title}
            </span>
            <span style={{ marginTop: '10px', fontSize: '10px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
              {authors}
            </span>
          </div>
        )}

        {/* Status Badges Overlay (Top Right) */}
        <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px', flexDirection: 'column', alignItems: 'flex-end' }}>
          {shelfStatus && (
            <span style={{
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
              color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)',
              padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase'
            }}>
              {STATUS_LABELS[shelfStatus]}
            </span>
          )}
          {isReadable && !shelfStatus && (
            <span style={{
              background: 'var(--accent-primary)', color: '#fff',
              padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em'
            }}>
              📖 Read
            </span>
          )}
        </div>

        {/* Progress Bar (Bottom Edge of Cover) */}
        {shelfStatus === 'reading' && (
          <div className="progress-thin-track">
            <div className="progress-thin-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
        
        {/* Abstract Hover Actions (Netflix Style) */}
        <div 
          className="hover-actions-overlay"
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', opacity: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px',
            transition: 'opacity 0.2s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0}
        >
          {isReadable && (
            <button onClick={handleRead} style={{
              background: '#fff', color: '#000', padding: '8px 16px', borderRadius: '100px',
              fontWeight: 600, fontSize: '12px', border: 'none', cursor: 'pointer'
            }}>
              ▶ Read Now
            </button>
          )}
          {(onAddToShelf || shelfStatus) && (
            <button onClick={handleShelfClick} style={{
              background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)', color: '#fff', 
              padding: '6px 12px', borderRadius: '100px', fontWeight: 500, fontSize: '11px', border: '1px solid rgba(255,255,255,0.4)', cursor: 'pointer'
            }}>
              {shelfStatus ? '↻ Move Status' : '+ Add to Library'}
            </button>
          )}
        </div>
      </div>

      {/* Typography Region */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 4px' }}>
        <h3 style={{
          fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>
          {title}
        </h3>
        <p style={{
          fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {authors}
        </p>
      </div>

    </div>
  );
}
