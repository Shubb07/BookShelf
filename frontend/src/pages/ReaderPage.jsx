import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';

export default function ReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readerData, setReaderData] = useState(null);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Real progress state
  const [currentPage, setCurrentPage] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [shelfBookId, setShelfBookId] = useState(null);

  // Manual page input
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualPageValue, setManualPageValue] = useState('');

  // Quick "+pages" log
  const [quickPages, setQuickPages] = useState('');

  // Save status indicator: null | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState(null);

  // Refs to avoid stale closures in effects
  const lastSavedPageRef = useRef(0);
  const currentPageRef = useRef(0);
  const shelfBookIdRef = useRef(null);
  const saveTimerRef = useRef(null);

  // Keep refs in sync
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { shelfBookIdRef.current = shelfBookId; }, [shelfBookId]);

  const bookTitle = state?.title || 'Book';
  const bookAuthor = state?.authors || '';

  // ── 1. Fetch the reader URL ──────────────────────────────────────────────
  useEffect(() => {
    if (state?.readUrl) {
      setReaderData({
        available: true,
        read_url: state.readUrl,
        ebook_access: state.ebookAccess || 'unknown',
      });
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ title: bookTitle });
    if (bookAuthor) params.append('author', bookAuthor);

    api.get(`books/open-library/?${params.toString()}`)
      .then(res => {
        if (res.data.available) setReaderData(res.data);
        else setError('This book is not available for reading on Open Library.');
      })
      .catch(() => setError('Failed to look up book availability.'))
      .finally(() => setLoading(false));
  }, [id, bookTitle, bookAuthor, state]);

  // ── 2. Load saved progress from shelf ───────────────────────────────────
  useEffect(() => {
    if (!id) return;
    api.get('shelf/')
      .then(res => {
        const match = res.data.find(b => b.google_book_id === id);
        if (match) {
          setShelfBookId(match.id);
          shelfBookIdRef.current = match.id;
          const savedPages = match.total_pages_read || 0;
          setCurrentPage(savedPages);
          currentPageRef.current = savedPages;
          lastSavedPageRef.current = savedPages;   // start from here, don't double-count
          setProgressPercent(match.progress_percent || 0);
          setPageCount(match.page_count || 0);

          // Opening the reader means you're reading it — promote from
          // "want to read" so it shows up under Currently Reading.
          if (match.status === 'want_to_read') {
            api.patch(`shelf/${match.id}/`, { status: 'reading' }).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, [id]);

  // ── 3. Core save function ────────────────────────────────────────────────
  const saveProgress = useCallback(async (newPage) => {
    const bookId = shelfBookIdRef.current;
    if (!bookId) return;

    const pagesThisSession = newPage - lastSavedPageRef.current;
    if (pagesThisSession <= 0) return;     // no forward progress to save

    setSaveStatus('saving');
    try {
      const today = new Date().toISOString().split('T')[0];
      await api.post('tracker/', {
        user_book: bookId,
        pages_read: pagesThisSession,
        date: today,
        notes: 'Auto-logged via reader',
      });
      lastSavedPageRef.current = newPage;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, []);

  // ── 4. Update page state + trigger debounced save ────────────────────────
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    currentPageRef.current = newPage;

    setPageCount(prev => {
      if (prev > 0) {
        setProgressPercent(Math.min(
          Math.round((newPage / prev) * 1000) / 10,
          100
        ));
      }
      return prev;
    });

    // Debounce: wait 5 s of no page-turns before saving
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveProgress(newPage), 5000);
  }, [saveProgress]);

  // ── 5. Listen to postMessage from Internet Archive iframe ────────────────
  useEffect(() => {
    const handleMessage = (event) => {
      // Only trust messages from archive.org
      if (!event.origin.includes('archive.org')) return;

      const data = event.data;
      if (!data || typeof data !== 'object') return;

      let pageNum = null;

      // Try all known IA BookReader postMessage formats
      if (data.type === 'BookReader:pageChanged' && data.payload?.page !== undefined) {
        pageNum = Number(data.payload.page);
      } else if (data.type === 'pageChanged' && data.page !== undefined) {
        pageNum = Number(data.page);
      } else if (data.br?.page !== undefined) {
        pageNum = Number(data.br.page);
      } else if (typeof data.page === 'number') {
        pageNum = data.page;
      }

      if (pageNum !== null && !isNaN(pageNum) && pageNum > currentPageRef.current) {
        handlePageChange(pageNum);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [handlePageChange]);

  // ── 6. Save any unsaved progress when leaving the page ──────────────────
  useEffect(() => {
    return () => {
      // Component unmount — flush any pending save immediately
      const unsavedPages = currentPageRef.current - lastSavedPageRef.current;
      if (unsavedPages > 0 && shelfBookIdRef.current) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveProgress(currentPageRef.current);
      }
    };
  }, [saveProgress]);

  // ── 7. Manual "Set Page" submit ──────────────────────────────────────────
  const handleManualSave = async () => {
    const newPage = parseInt(manualPageValue, 10);
    if (isNaN(newPage) || newPage < 0) return;
    const clamped = pageCount > 0 ? Math.min(newPage, pageCount) : newPage;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current); // cancel pending debounce
    handlePageChange(clamped);
    setShowManualInput(false);
    setManualPageValue('');
    await saveProgress(clamped);
  };

  // ── Quick "+pages" log: add N pages to current progress and save now ─────
  const handleQuickAdd = async (e) => {
    e?.preventDefault();
    const n = parseInt(quickPages, 10);
    if (isNaN(n) || n < 1) return;
    const newPage = currentPageRef.current + n;
    const clamped = pageCount > 0 ? Math.min(newPage, pageCount) : newPage;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current); // cancel pending debounce
    handlePageChange(clamped);
    setQuickPages('');
    await saveProgress(clamped);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const SaveIndicator = () => {
    if (!saveStatus) return null;
    const config = {
      saving: { text: 'Saving…',  color: 'var(--text-muted)', icon: '⏳' },
      saved:  { text: 'Saved ✓',  color: '#4ade80',           icon: ''   },
      error:  { text: 'Save failed', color: '#f87171',        icon: '⚠️' },
    }[saveStatus];
    return (
      <span style={{ fontSize: '12px', color: config.color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
        {config.icon} {config.text}
      </span>
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg-base)', display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', zIndex: 10,
        gap: '16px',
      }}>

        {/* Left: Back + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px',
              transition: 'color 0.2s', flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            title="Go Back"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{
              fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: '-0.01em', lineHeight: 1.2,
            }}>
              {bookTitle}
            </h2>
            {bookAuthor && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                {bookAuthor}
              </p>
            )}
          </div>
        </div>

        {/* Center: Live Progress Pill */}
        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <span style={{
              fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)',
              background: 'var(--bg-base)', padding: '6px 14px', borderRadius: '100px',
              border: '1px solid var(--border-subtle)', whiteSpace: 'nowrap',
            }}>
              Page {currentPage}{pageCount > 0 ? ` / ${pageCount}` : ''} &bull; {progressPercent}% completed
            </span>

            {/* Progress bar below pill */}
            {pageCount > 0 && (
              <div style={{
                width: '160px', height: '3px', borderRadius: '2px',
                background: 'var(--border-subtle)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: '2px',
                  background: 'var(--accent-primary)',
                  width: `${progressPercent}%`,
                  transition: 'width 0.6s ease',
                }} />
              </div>
            )}
          </div>
        )}

        {/* Right: Controls */}
        {!loading && !error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'flex-end' }}>

            {/* Save Status */}
            <SaveIndicator />

            {/* Quick +pages log */}
            <form onSubmit={handleQuickAdd} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                type="number"
                min={1}
                value={quickPages}
                onChange={e => setQuickPages(e.target.value)}
                placeholder="+pages"
                disabled={!shelfBookId}
                title={shelfBookId ? 'Add pages you just read' : 'Add this book to your shelf to track progress'}
                style={{
                  width: '72px', background: 'var(--bg-base)',
                  border: '1px solid var(--border-subtle)', borderRadius: '6px',
                  padding: '6px 8px', color: 'var(--text-primary)', fontSize: '12px',
                  fontWeight: 600, outline: 'none', opacity: shelfBookId ? 1 : 0.5,
                }}
              />
              <button
                type="submit"
                disabled={!shelfBookId || !quickPages}
                style={{
                  background: 'var(--accent-primary)', color: '#fff', border: 'none',
                  borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 700,
                  cursor: !shelfBookId || !quickPages ? 'not-allowed' : 'pointer',
                  opacity: !shelfBookId || !quickPages ? 0.5 : 1,
                }}
              >
                Log
              </button>
            </form>

            {/* Manual Set Page */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowManualInput(v => !v); setManualPageValue(String(currentPage)); }}
                title="Manually update your current page"
                style={{
                  background: showManualInput ? 'var(--bg-surface-active)' : 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  padding: '6px 10px', borderRadius: '6px',
                  fontSize: '12px', fontWeight: 600, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: '5px',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
                </svg>
                Set Page
              </button>

              {/* Dropdown input panel */}
              {showManualInput && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: '10px', padding: '14px', zIndex: 100,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: '200px',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    Enter current page number
                    {pageCount > 0 && <span style={{ color: 'var(--text-secondary)' }}> (of {pageCount})</span>}
                  </p>
                  <input
                    type="number"
                    min={0}
                    max={pageCount || undefined}
                    value={manualPageValue}
                    onChange={e => setManualPageValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleManualSave()}
                    autoFocus
                    style={{
                      background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
                      borderRadius: '6px', padding: '8px 10px', color: 'var(--text-primary)',
                      fontSize: '14px', fontWeight: 600, outline: 'none',
                    }}
                    placeholder="e.g. 120"
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleManualSave}
                      style={{
                        flex: 1, background: 'var(--accent-primary)', color: '#fff',
                        border: 'none', borderRadius: '6px', padding: '8px',
                        fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      Save Progress
                    </button>
                    <button
                      onClick={() => setShowManualInput(false)}
                      style={{
                        background: 'var(--bg-surface-active)', color: 'var(--text-muted)',
                        border: 'none', borderRadius: '6px', padding: '8px 12px',
                        fontSize: '12px', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {!shelfBookId && (
                    <p style={{ fontSize: '11px', color: '#f87171' }}>
                      ⚠️ Add this book to your shelf first to save progress.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bookmark */}
            <button
              onClick={() => setIsBookmarked(!isBookmarked)}
              style={{
                background: 'transparent', border: 'none',
                color: isBookmarked ? 'var(--accent-primary)' : 'var(--text-muted)',
                cursor: 'pointer', padding: '8px', borderRadius: '4px',
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', fontWeight: 600,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <svg width="18" height="18" fill={isBookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Bookmark
            </button>
          </div>
        )}
      </div>

      {/* ── Content Area ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', background: '#000' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '16px', background: 'var(--bg-base)',
          }}>
            <div className="shimmer" style={{ width: '48px', height: '64px', borderRadius: '4px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading reading experience...</p>
          </div>
        )}

        {error && (
          <div className="page-enter" style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '16px', background: 'var(--bg-base)',
          }}>
            <svg width="48" height="48" style={{ opacity: 0.3 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Not Available</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '400px', textAlign: 'center' }}>
              Only explicitly readable/borrowable books from the Internet Archive are accessible here.
            </p>
          </div>
        )}

        {readerData && !loading && !error && (
          <iframe
            src={readerData.read_url}
            title={`Read ${bookTitle}`}
            style={{ width: '100%', height: '100%', border: 'none', background: '#000', display: 'block' }}
            allowFullScreen
          />
        )}
      </div>

    </div>
  );
}
