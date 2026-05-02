import requests
from django.conf import settings
from django.core.cache import cache
from django.db import models as db_models
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import User, Profile, UserBook, ReadingSession, Review
from .serializers import (
    RegisterSerializer, ProfileSerializer, UserBookSerializer,
    ReadingSessionSerializer, ReviewSerializer,
)

GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes'


# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        try:
            serializer = self.get_serializer(data=request.data)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            user = serializer.save()
            return Response(
                {'message': 'User registered successfully.', 'username': user.username},
                status=status.HTTP_201_CREATED,
            )
        except Exception as exc:
            return Response(
                {'detail': 'Registration failed. Please try again.', 'error': str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class LoginView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]


class DeleteAccountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        password = request.data.get('password', '')
        if not password:
            return Response(
                {'error': 'Password is required to delete your account.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not request.user.check_password(password):
            return Response(
                {'error': 'Incorrect password.'},
                status=status.HTTP_403_FORBIDDEN
            )
        request.user.delete()
        return Response(
            {'message': 'Account deleted successfully.'},
            status=status.HTTP_200_OK
        )


# ─────────────────────────────────────────────
# PROFILE
# ─────────────────────────────────────────────

class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        serializer = ProfileSerializer(profile)
        return Response(serializer.data)

    def put(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        serializer = ProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ─────────────────────────────────────────────
# BOOKS SEARCH (Google Books API)
# ─────────────────────────────────────────────

def normalize_book(item):
    """Normalize a Google Books API volume item."""
    info = item.get('volumeInfo', {})
    images = info.get('imageLinks', {})
    return {
        'google_book_id': item.get('id', ''),
        'title': info.get('title', 'Unknown Title'),
        'authors': ', '.join(info.get('authors', ['Unknown Author'])),
        'description': info.get('description', ''),
        'thumbnail': images.get('thumbnail', images.get('smallThumbnail', '')),
        'published_date': info.get('publishedDate', ''),
        'page_count': info.get('pageCount', 0),
        'categories': ', '.join(info.get('categories', [])),
    }


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def book_search(request):
    query = request.query_params.get('q', '').strip()
    if not query:
        return Response({'error': 'Query parameter "q" is required.'}, status=400)

    cache_key = f'book_search_{query.lower().replace(" ", "_")}'
    cached = cache.get(cache_key)
    if cached:
        return Response({'results': cached, 'source': 'cache'})

    params = {'q': query, 'maxResults': 20, 'printType': 'books'}
    api_key = settings.GOOGLE_BOOKS_API_KEY
    if api_key:
        params['key'] = api_key

    try:
        resp = requests.get(GOOGLE_BOOKS_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        return Response({'error': f'Google Books API error: {str(e)}'}, status=502)

    items = data.get('items', [])
    books = [normalize_book(item) for item in items]
    cache.set(cache_key, books, timeout=3600)  # 1 hour
    return Response({'results': books, 'source': 'api'})


# ─────────────────────────────────────────────
# SHELF (UserBook)
# ─────────────────────────────────────────────

class ShelfListCreateView(generics.ListCreateAPIView):
    serializer_class = UserBookSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = UserBook.objects.filter(user=self.request.user)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ShelfDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserBookSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'patch', 'delete']

    def get_queryset(self):
        return UserBook.objects.filter(user=self.request.user)


# ─────────────────────────────────────────────
# READING TRACKER
# ─────────────────────────────────────────────

class ReadingSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        book_id = request.query_params.get('book')
        qs = ReadingSession.objects.filter(user_book__user=request.user)
        if book_id:
            qs = qs.filter(user_book_id=book_id)
        serializer = ReadingSessionSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ReadingSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_book = serializer.validated_data['user_book']
        # Make sure user owns this book
        if user_book.user != request.user:
            return Response({'error': 'Not authorized.'}, status=403)
        session = serializer.save()
        # Update book status to 'reading' if it's 'want_to_read'
        if user_book.status == 'want_to_read':
            user_book.status = 'reading'
            user_book.save()
        return Response(
            {
                **ReadingSessionSerializer(session).data,
                'progress_percent': user_book.progress_percent,
                'total_pages_read': user_book.total_pages_read,
            },
            status=201,
        )


# ─────────────────────────────────────────────
# REVIEWS
# ─────────────────────────────────────────────

class ReviewListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get(self, request):
        book_id = request.query_params.get('book')
        qs = Review.objects.all()
        if book_id:
            qs = qs.filter(google_book_id=book_id)
        serializer = ReviewSerializer(qs, many=True)
        avg = qs.aggregate(avg=db_models.Avg('rating'))['avg']
        return Response({'reviews': serializer.data, 'average_rating': round(avg or 0, 2)})

    def post(self, request):
        # Check if user already reviewed this book
        existing = Review.objects.filter(
            user=request.user,
            google_book_id=request.data.get('google_book_id')
        ).first()
        if existing:
            serializer = ReviewSerializer(existing, data=request.data, partial=True)
        else:
            serializer = ReviewSerializer(data=request.data)

        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=201)


class MyReviewsView(generics.ListAPIView):
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Review.objects.filter(user=self.request.user)


# ─────────────────────────────────────────────
# DISCOVERY
# ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def discover(request):
    user = request.user

    # 1. Get categories from completed books
    completed = UserBook.objects.filter(user=user, status='completed')
    categories = []
    for book in completed:
        if book.categories:
            cats = [c.strip() for c in book.categories.split(',')]
            categories.extend(cats)

    # 2. Highly rated books from reviews
    high_rated = Review.objects.values('google_book_id').annotate(
        avg=db_models.Avg('rating')
    ).filter(avg__gte=4).values_list('google_book_id', flat=True)

    # 3. Popular books (most added to shelf)
    popular = (
        UserBook.objects.values('google_book_id', 'title', 'authors', 'thumbnail')
        .annotate(count=db_models.Count('id'))
        .order_by('-count')[:5]
    )

    # Build search queries
    queries = list(set(categories[:3]))  # top 3 unique categories
    if not queries:
        queries = ['bestseller fiction', 'popular science']

    results = []
    api_key = settings.GOOGLE_BOOKS_API_KEY
    seen_ids = set(UserBook.objects.filter(user=user).values_list('google_book_id', flat=True))

    for q in queries[:2]:
        cache_key = f'discover_{q.lower().replace(" ", "_")}'
        cached = cache.get(cache_key)
        if cached:
            results.extend(cached)
            continue
        params = {'q': q, 'maxResults': 10, 'orderBy': 'relevance', 'printType': 'books'}
        if api_key:
            params['key'] = api_key
        try:
            resp = requests.get(GOOGLE_BOOKS_URL, params=params, timeout=10)
            resp.raise_for_status()
            items = resp.json().get('items', [])
            books = [normalize_book(i) for i in items]
            cache.set(cache_key, books, timeout=3600)
            results.extend(books)
        except Exception:
            pass

    # Filter out books already on user's shelf and deduplicate
    seen = set()
    filtered = []
    for book in results:
        bid = book['google_book_id']
        if bid not in seen and bid not in seen_ids:
            seen.add(bid)
            filtered.append(book)

    return Response({
        'recommendations': filtered[:20],
        'based_on_categories': queries,
        'popular_in_community': list(popular),
    })


# ─────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def dashboard(request):
    user = request.user
    profile, _ = Profile.objects.get_or_create(user=user)

    shelf = UserBook.objects.filter(user=user)
    total = shelf.count()
    reading_count = shelf.filter(status='reading').count()
    completed_count = shelf.filter(status='completed').count()
    want_count = shelf.filter(status='want_to_read').count()

    goal = profile.reading_goal or 1
    goal_progress = round((completed_count / goal) * 100, 1) if goal else 0

    # Recent activity: last 5 reading sessions
    recent_sessions = ReadingSession.objects.filter(
        user_book__user=user
    ).select_related('user_book').order_by('-created_at')[:5]

    recent_activity = [
        {
            'book_title': s.user_book.title,
            'pages_read': s.pages_read,
            'date': s.date,
            'notes': s.notes,
        }
        for s in recent_sessions
    ]

    # Top categories from completed books
    completed_books = shelf.filter(status='completed')
    cat_counts = {}
    for book in completed_books:
        for cat in book.categories.split(','):
            cat = cat.strip()
            if cat:
                cat_counts[cat] = cat_counts.get(cat, 0) + 1
    top_categories = sorted(cat_counts, key=cat_counts.get, reverse=True)[:5]

    return Response({
        'total_books': total,
        'reading': reading_count,
        'completed': completed_count,
        'want_to_read': want_count,
        'reading_goal': goal,
        'goal_progress_percent': min(goal_progress, 100),
        'recent_activity': recent_activity,
        'top_categories': top_categories,
    })


OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json'
OL_HEADERS = {'User-Agent': 'BookShelf/1.0 (bookshelf-app)'}


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def open_library_search(request):
    """Search Open Library for books — returns results with reading availability."""
    query = request.query_params.get('q', '').strip()
    if not query:
        return Response({'error': 'Query parameter "q" is required.'}, status=400)

    cache_key = f'ol_search_{query.lower().replace(" ", "_")}'
    cached = cache.get(cache_key)
    if cached:
        return Response({'results': cached, 'source': 'cache'})

    try:
        resp = requests.get(
            OPEN_LIBRARY_SEARCH_URL,
            params={
                'q': query,
                'limit': 30,
                'fields': 'key,title,author_name,cover_i,first_publish_year,'
                          'number_of_pages_median,subject,ia,ebook_access,has_fulltext',
            },
            headers=OL_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        return Response({'error': f'Open Library API error: {str(e)}'}, status=502)

    books = []
    for doc in data.get('docs', []):
        cover_id = doc.get('cover_i')
        thumbnail = f'https://covers.openlibrary.org/b/id/{cover_id}-M.jpg' if cover_id else ''

        has_fulltext = doc.get('has_fulltext', False)
        ebook_access = doc.get('ebook_access', 'no_ebook')
        readable = has_fulltext and ebook_access in ('public', 'borrowable')

        # Pick best IA identifier for readable books
        read_url = None
        ia_id = None
        if readable and doc.get('ia'):
            for identifier in doc['ia']:
                if not identifier.startswith(('bwb_', 'isbn_', 'lccn_')):
                    ia_id = identifier
                    break
            if not ia_id:
                ia_id = doc['ia'][0]
            read_url = f'https://archive.org/embed/{ia_id}'

        subjects = doc.get('subject', [])
        categories = ', '.join(subjects[:3]) if subjects else ''

        ol_key = doc.get('key', '')
        # Use OL work key as the ID (e.g. "OL15626917W")
        ol_id = ol_key.replace('/works/', '') if ol_key else ''

        books.append({
            'google_book_id': f'ol_{ol_id}',  # Prefix to distinguish from Google Books
            'ol_key': ol_key,
            'title': doc.get('title', 'Unknown Title'),
            'authors': ', '.join(doc.get('author_name', ['Unknown Author'])),
            'thumbnail': thumbnail,
            'published_date': str(doc.get('first_publish_year', '')),
            'page_count': doc.get('number_of_pages_median', 0) or 0,
            'categories': categories,
            'description': '',
            'readable': readable,
            'ebook_access': ebook_access,
            'read_url': read_url,
            'ia_id': ia_id,
            'source': 'openlibrary',
        })

    cache.set(cache_key, books, timeout=3600)
    return Response({'results': books, 'source': 'api'})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def open_library_lookup(request):
    """Look up a book on Open Library and return reading availability."""
    title = request.query_params.get('title', '').strip()
    author = request.query_params.get('author', '').strip()

    if not title:
        return Response({'error': 'Title parameter is required.'}, status=400)

    cache_key = f'ol_lookup_{title.lower().replace(" ", "_")}_{author.lower().replace(" ", "_")}'
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    
    search_params = {
        'title': title,
        'limit': 15,
        'fields': 'key,title,author_name,isbn,ia,ebook_access,has_fulltext,language',
    }
    if author:
        
        first_author = author.split(',')[0].strip()
        search_params['author'] = first_author

    try:
        resp = requests.get(
            OPEN_LIBRARY_SEARCH_URL,
            params=search_params,
            headers=OL_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        return Response({'error': f'Open Library API error: {str(e)}'}, status=502)

    docs = data.get('docs', [])

 
    result = {
        'available': False,
        'ebook_access': 'no_ebook',
        'read_url': None,
        'ia_id': None,
        'ol_key': None,
        'ol_title': None,
    }

    def _pick_ia_id(ia_list):
        """Pick the best Internet Archive identifier from a list."""
        for identifier in ia_list:
            if not identifier.startswith('bwb_') and not identifier.startswith('isbn_') and not identifier.startswith('lccn_'):
                return identifier
        return ia_list[0] if ia_list else None

    def _title_similarity(doc_title, search_title):
        """Simple title matching score (0-1)."""
        a = doc_title.lower().strip()
        b = search_title.lower().strip()
        if a == b:
            return 1.0
        if b in a or a in b:
            return 0.8
        
        words_a = set(a.split())
        words_b = set(b.split())
        if not words_b:
            return 0
        return len(words_a & words_b) / len(words_b)

    
    candidates = []
    for doc in docs:
        if not doc.get('has_fulltext') or not doc.get('ia'):
            continue

        ia_id = _pick_ia_id(doc['ia'])
        if not ia_id:
            continue

        score = 0
        doc_title = doc.get('title', '')

       
        score += _title_similarity(doc_title, title) * 50

      
        languages = doc.get('language', [])
        if 'eng' in languages:
            score += 20
        elif not languages:
            score += 10  

        
        access = doc.get('ebook_access', '')
        if access == 'public':
            score += 15
        elif access == 'borrowable':
            score += 5

        candidates.append({
            'score': score,
            'ia_id': ia_id,
            'ebook_access': access,
            'ol_key': doc.get('key', ''),
            'ol_title': doc_title,
        })

    
    if candidates:
        candidates.sort(key=lambda c: c['score'], reverse=True)
        best = candidates[0]
        result = {
            'available': True,
            'ebook_access': best['ebook_access'],
            'read_url': f'https://archive.org/embed/{best["ia_id"]}',
            'ia_id': best['ia_id'],
            'ol_key': best['ol_key'],
            'ol_title': best['ol_title'],
        }

    cache.set(cache_key, result, timeout=86400)  
    return Response(result)


