from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, Profile, UserBook, ReadingSession, Review


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'first_name', 'last_name')
        extra_kwargs = {
            'first_name': {'required': False, 'default': ''},
            'last_name': {'required': False, 'default': ''},
        }

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('A user with this username already exists.')
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def create(self, validated_data):
        try:
            user = User.objects.create_user(
                username=validated_data['username'],
                email=validated_data.get('email', ''),
                password=validated_data['password'],
                first_name=validated_data.get('first_name', ''),
                last_name=validated_data.get('last_name', ''),
            )
            return user
        except Exception as exc:
            raise serializers.ValidationError({'detail': str(exc)})


class ProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)

    class Meta:
        model = Profile
        fields = ('id', 'username', 'email', 'first_name', 'last_name',
                  'bio', 'avatar_url', 'reading_goal')


class UserBookSerializer(serializers.ModelSerializer):
    total_pages_read = serializers.ReadOnlyField()
    progress_percent = serializers.ReadOnlyField()

    class Meta:
        model = UserBook
        fields = (
            'id', 'google_book_id', 'title', 'authors', 'thumbnail',
            'status', 'page_count', 'categories', 'added_at',
            'total_pages_read', 'progress_percent',
        )
        read_only_fields = ('id', 'added_at', 'total_pages_read', 'progress_percent')


class ReadingSessionSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source='user_book.title', read_only=True)

    class Meta:
        model = ReadingSession
        fields = ('id', 'user_book', 'book_title', 'pages_read', 'date', 'notes', 'created_at')
        read_only_fields = ('id', 'created_at', 'book_title')


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Review
        fields = (
            'id', 'google_book_id', 'book_title', 'rating', 'review_text',
            'username', 'created_at'
        )
        read_only_fields = ('id', 'username', 'created_at')
