# Feature Plan: Multi-User Authentication System

**Branch:** `feature/multi-user-authentication`  
**Status:** Planning  
**Last Updated:** 2026-04-16  
**Related:** `feature/instagram-sync-worker` (uses multi-user architecture)

## Overview

Implement user authentication and multi-user isolation across the platform. Currently the app is single-admin; this feature enables multiple users to have independent recipe collections, sync settings, and preferences.

**Why:**
- Users can access their own data from frontend
- Instagram sync works per-user (not shared)
- Settings are user-specific (language, theme, etc.)
- Foundation for future sharing/collaboration features
- Privacy: each user's data isolated from others

**Scope:**
- User registration/login (Telegram + Frontend)
- Per-user data isolation (recipes, sync state, preferences)
- Admin role management
- JWT/session authentication (TBD: which method)
- Integration with existing Telegram bot
- REST API with auth middleware

## Architecture

```
┌─ Web Browser
│  ├─ Login page (email/password or Telegram auth)
│  ├─ Protected routes with JWT/session
│  └─ GET /api/user/me (get current user)
│
├─ Telegram Bot
│  ├─ /start → prompt "Link Telegram to account?"
│  ├─ Linker: "Use code XYZ on website within 10 min"
│  └─ Update user.telegram_user_id after linking
│
├─ FastAPI Backend (with auth middleware)
│  ├─ POST /auth/register (email, password)
│  ├─ POST /auth/login (email, password) → JWT token
│  ├─ POST /auth/telegram-link (user_id, telegram_user_id)
│  ├─ GET /api/user/me (requires auth)
│  └─ Authorize all endpoints with Depends(get_current_user)
│
├─ Database (user-scoped)
│  ├─ users (id, email, password_hash, telegram_user_id)
│  ├─ user_preferences (user_id, language, theme, ...)
│  ├─ recipes (user_id, ...) ← per-user isolation
│  ├─ instagram_sync_collections (user_id, ...) ← user-specific
│  ├─ instagram_sync_state (user_id, ...) ← user-specific
│  ├─ admin_users (id, user_id, is_active)
│  └─ audit_log (user_id, action, timestamp) ← track user actions
│
└─ Background Workers (user-aware)
   ├─ run_instagram_sync(user_id) ← per-user collections
   └─ run_worker(user_id) ← per-user recipe processing
```

## Files

| File | Action | Status |
|------|--------|--------|
| `backend/app/models.py` | Update: Add User, AdminUser, UserPreferences models | Pending |
| `backend/app/auth.py` | Create: Auth routes (register, login, telegram-link) | NEW |
| `backend/app/dependencies.py` | Create: get_current_user dependency | NEW |
| `backend/app/main.py` | Update: Add auth middleware, pass user_id to workers | Pending |
| `backend/tests/unit/test_auth.py` | Create: TDD auth tests | NEW |
| `backend/tests/integration/test_multi_user.py` | Create: Multi-user isolation tests | NEW |
| `supabase/migrations/011_users.sql` | Create: users table | NEW |
| `supabase/migrations/012_user_preferences.sql` | Create: preferences table | NEW |
| `supabase/migrations/013_admin_users.sql` | Update: Link to users table | NEW |
| `frontend/src/pages/LoginPage.tsx` | Create: Login/register UI | NEW |
| `frontend/src/pages/SettingsPage.tsx` | Create: User preferences UI | NEW |
| `frontend/src/context/AuthContext.tsx` | Create: JWT token management | NEW |
| `frontend/src/lib/api.ts` | Update: Add auth header to all requests | Pending |
| `.env.example` | Add: JWT secret, session config | Pending |

## Implementation Details

### 1. Database Schema

**Migration 011: users table**
```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Telegram integration
    telegram_user_id BIGINT UNIQUE,
    telegram_username VARCHAR(100),
    telegram_linked_at TIMESTAMP,
    
    -- Account status
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    last_login_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_telegram_user_id ON users(telegram_user_id);
```

**Migration 012: user_preferences table**
```sql
CREATE TABLE user_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Language/localization
    language VARCHAR(10) DEFAULT 'de',  -- de, en, it, fr, es
    
    -- UI preferences
    theme VARCHAR(20) DEFAULT 'system',  -- light, dark, system
    recipe_view VARCHAR(20) DEFAULT 'grid',  -- list, grid, cards
    
    -- Notifications
    notify_recipe_complete BOOLEAN DEFAULT true,
    notify_import_errors BOOLEAN DEFAULT true,
    
    -- Privacy
    show_profile BOOLEAN DEFAULT false,
    allow_sharing BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
```

**Migration 013: admin_users table (updated)**
```sql
CREATE TABLE admin_users (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Permissions (for future: granular admin roles)
    can_manage_users BOOLEAN DEFAULT false,
    can_view_logs BOOLEAN DEFAULT false,
    can_manage_settings BOOLEAN DEFAULT false,
    
    granted_at TIMESTAMP DEFAULT now(),
    granted_by BIGINT REFERENCES users(id)
);
```

### 2. User Model

**`backend/app/models.py`** - Add Pydantic models:

```python
from sqlalchemy import Column, String, Integer, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    
    id: int = Column(Integer, primary_key=True)
    email: str = Column(String(255), unique=True, nullable=False)
    username: str = Column(String(100), unique=True, nullable=False)
    password_hash: str = Column(String(255), nullable=False)
    
    # Telegram integration
    telegram_user_id: Optional[int] = Column(Integer, unique=True, nullable=True)
    telegram_username: Optional[str] = Column(String(100), nullable=True)
    telegram_linked_at: Optional[datetime] = Column(DateTime, nullable=True)
    
    # Account status
    is_active: bool = Column(Boolean, default=True)
    is_admin: bool = Column(Boolean, default=False)
    created_at: datetime = Column(DateTime, default=datetime.utcnow)
    updated_at: datetime = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at: Optional[datetime] = Column(DateTime, nullable=True)
    
    # Relationships
    preferences = relationship("UserPreferences", back_populates="user")
    recipes = relationship("Recipe", back_populates="user")
    import_jobs = relationship("ImportQueueJob", back_populates="user")
    sync_collections = relationship("InstagramSyncCollections", back_populates="user")
    sync_state = relationship("InstagramSyncState", back_populates="user")

class UserPreferences(Base):
    __tablename__ = "user_preferences"
    
    id: int = Column(Integer, primary_key=True)
    user_id: int = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    language: str = Column(String(10), default="de")
    theme: str = Column(String(20), default="system")
    recipe_view: str = Column(String(20), default="grid")
    notify_recipe_complete: bool = Column(Boolean, default=True)
    notify_import_errors: bool = Column(Boolean, default=True)
    show_profile: bool = Column(Boolean, default=False)
    allow_sharing: bool = Column(Boolean, default=True)
    
    created_at: datetime = Column(DateTime, default=datetime.utcnow)
    updated_at: datetime = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="preferences")

# Pydantic schemas for API
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    telegram_user_id: Optional[int]
    is_admin: bool
    created_at: datetime

class UserPreferencesUpdate(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None
    recipe_view: Optional[str] = None
    notify_recipe_complete: Optional[bool] = None
    notify_import_errors: Optional[bool] = None
```

### 3. Authentication Routes

**`backend/app/auth.py`** - Create new module:

```python
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["auth"])

# Configuration
SECRET_KEY = settings.jwt_secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = {"sub": str(user_id), "type": "access"}
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(user_id: int) -> str:
    """Create JWT refresh token (longer expiry)"""
    to_encode = {"sub": str(user_id), "type": "refresh"}
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@router.post("/register")
async def register(user_create: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register new user (email + password)"""
    
    # Check if user exists
    existing = await db.execute(
        select(User).where((User.email == user_create.email) | (User.username == user_create.username))
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Email or username already exists")
    
    # Create user
    user = User(
        email=user_create.email,
        username=user_create.username,
        password_hash=hash_password(user_create.password),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create default preferences
    prefs = UserPreferences(user_id=user.id)
    db.add(prefs)
    await db.commit()
    
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "message": "User created successfully. Please log in."
    }

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """Login with email (username in form) + password"""
    
    # Find user by email (using username field from form)
    result = await db.execute(
        select(User).where(User.email == form_data.username)
    )
    user = result.scalars().first()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")
    
    # Update last_login_at
    user.last_login_at = datetime.utcnow()
    db.add(user)
    await db.commit()
    
    # Create tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "is_admin": user.is_admin
        }
    }

@router.post("/telegram-link")
async def telegram_link(
    telegram_user_id: int,
    telegram_username: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Link Telegram account to user account
    
    Called from either:
    1. Frontend: User logged in, clicks "Link Telegram" button
    2. Telegram: User sends /link command with code
    """
    
    # Check if telegram_user_id already linked to another user
    existing = await db.execute(
        select(User).where(User.telegram_user_id == telegram_user_id)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Telegram account already linked to another user")
    
    # Update current user
    current_user.telegram_user_id = telegram_user_id
    current_user.telegram_username = telegram_username
    current_user.telegram_linked_at = datetime.utcnow()
    db.add(current_user)
    await db.commit()
    
    return {
        "message": f"Telegram account @{telegram_username} linked successfully",
        "user_id": current_user.id
    }

@router.post("/refresh")
async def refresh(token: str = Depends(oauth2_scheme)):
    """Refresh access token using refresh token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if token_type != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    access_token = create_access_token(int(user_id))
    return {"access_token": access_token, "token_type": "bearer"}
```

### 4. Middleware & Dependencies

**`backend/app/dependencies.py`** - Create new module:

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Dependency to extract and validate current user from JWT token"""
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"}
    )
    
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
        user_id: Optional[str] = payload.get("sub")
        token_type: Optional[str] = payload.get("type")
        
        if user_id is None or token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Fetch user from DB
    result = await db.execute(
        select(User).where(User.id == int(user_id))
    )
    user = result.scalars().first()
    
    if not user or not user.is_active:
        raise credentials_exception
    
    return user

async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Dependency to ensure user is admin"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
```

### 5. API Endpoints with Auth

**Update existing endpoints** to require auth:

```python
@app.get("/api/user/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current logged-in user's info"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "is_admin": current_user.is_admin,
        "telegram_user_id": current_user.telegram_user_id,
        "created_at": current_user.created_at
    }

@app.get("/api/user/preferences")
async def get_preferences(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get user's preferences"""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.scalars().first()
    return prefs

@app.post("/api/user/preferences")
async def update_preferences(
    update: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user's preferences"""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.scalars().first()
    
    # Update fields if provided
    for field, value in update.dict(exclude_unset=True).items():
        setattr(prefs, field, value)
    
    prefs.updated_at = datetime.utcnow()
    db.add(prefs)
    await db.commit()
    return prefs

# Recipe endpoints - add user_id filter
@app.get("/api/recipes")
async def list_recipes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List recipes for current user only"""
    result = await db.execute(
        select(Recipe).where(Recipe.user_id == current_user.id)
    )
    return result.scalars().all()

# Instagram sync endpoints - user-specific
@app.get("/api/instagram-sync/settings")
async def get_sync_settings(
    current_user: User = Depends(get_current_user)
):
    """Get sync settings for current user"""
    sync_control = await get_sync_control_for_user(current_user.id)
    return {
        "enabled": sync_control.enabled,
        "selected_collection": sync_control.selected_collection,
        "last_status": sync_control.last_status
    }

@app.post("/api/instagram-sync/settings")
async def update_sync_settings(
    update: SyncSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update sync settings for current user"""
    # Only allow users to modify their own settings
    result = await db.execute(
        select(InstagramSyncCollections)
        .where(
            (InstagramSyncCollections.user_id == current_user.id)
            & (InstagramSyncCollections.enabled_at.isnot(None))
        )
    )
    collection = result.scalars().first()
    
    if update.enabled is not None:
        # Update in-memory control
        sync_control = await get_sync_control_for_user(current_user.id)
        sync_control.enabled = update.enabled
    
    return {"message": "Settings updated", "user_id": current_user.id}
```

### 6. Frontend Integration

**`frontend/src/context/AuthContext.tsx`** - Create:

```typescript
// Authentication context for React
import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface AuthContextType {
  user: UserResponse | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  linkTelegram: (telegram_user_id: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On mount, verify token and fetch user
    if (token) {
      api.get('/user/me')
        .then(response => setUser(response.data))
        .catch(() => {
          localStorage.removeItem('access_token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const response = await api.post('/auth/login', { username: email, password });
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('refresh_token', response.data.refresh_token);
    setToken(response.data.access_token);
    setUser(response.data.user);
  };

  const register = async (email: string, username: string, password: string) => {
    await api.post('/auth/register', { email, username, password });
    // Auto-login after successful registration
    await login(email, password);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUser(null);
  };

  const linkTelegram = async (telegram_user_id: number) => {
    await api.post('/auth/telegram-link', { telegram_user_id });
    // Refresh user info
    const response = await api.get('/user/me');
    setUser(response.data);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, linkTelegram }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

**`frontend/src/lib/api.ts`** - Update:

```typescript
// Add Authorization header to all requests
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
});

// Add token to all requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → refresh token
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const response = await axios.post('/api/auth/refresh', { token: refreshToken });
          localStorage.setItem('access_token', response.data.access_token);
          // Retry original request
          return api(error.config);
        } catch {
          localStorage.removeItem('access_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
```

### 7. Telegram Integration

**Updated Telegram handlers** to integrate with user accounts:

```python
# In telegram_bot.py

@telegram_bot.message_handler(commands=['start'])
async def handle_start(message):
    """Prompt user to link account"""
    user_id = message.from_user.id
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("🔗 Mein Account auf miximixi.de linken", 
                                     url="https://miximixi.de/link-telegram"))
    
    await bot.send_message(
        message.chat.id,
        f"👋 Hallo {message.from_user.first_name}!\n\n"
        f"Um mit mir zu chatten, verknüpfe dein Telegram Konto mit deinem miximixi Account.",
        reply_markup=keyboard
    )

@telegram_bot.message_handler(commands=['link'])
async def handle_link(message):
    """Generate link code for account linking"""
    user_id = message.from_user.id
    
    # Generate 6-char code
    code = generate_code()  # Random 6-digit code
    
    # Store in Redis with 10 min expiry
    await redis.setex(f"telegram-link:{code}", 600, str(user_id))
    
    await bot.send_message(
        message.chat.id,
        f"📝 Dein Link-Code:\n\n`{code}`\n\n"
        f"Gehe auf https://miximixi.de und gib den Code ein.\n"
        f"(Gültig für 10 Minuten)",
        parse_mode="Markdown"
    )

# Frontend endpoint to complete linking
@app.post("/api/auth/telegram-link-code")
async def telegram_link_with_code(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Link Telegram using code from /link command"""
    
    # Retrieve code from Redis
    telegram_user_id = await redis.get(f"telegram-link:{code}")
    if not telegram_user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    
    telegram_user_id = int(telegram_user_id)
    
    # Delete code (one-time use)
    await redis.delete(f"telegram-link:{code}")
    
    # Link account (same as telegram-link endpoint)
    current_user.telegram_user_id = telegram_user_id
    db.add(current_user)
    await db.commit()
    
    return {"message": "Telegram account linked"}
```

## Testing Strategy (TDD)

### Phase 1: User Model & Registration

1. **TC1**: Register new user with valid email/password
2. **TC2**: Register fails if email already exists
3. **TC3**: Register fails if username already exists
4. **TC4**: Password is hashed, not stored plain
5. **TC5**: User preferences created automatically on registration
6. **TC6**: Login with correct email/password returns JWT token
7. **TC7**: Login fails with wrong password
8. **TC8**: Login fails with non-existent email

### Phase 2: JWT Authentication

9. **TC9**: decode JWT token retrieves user_id
10. **TC10**: Expired JWT token rejected
11. **TC11**: Invalid JWT token rejected
12. **TC12**: Refresh token generates new access token
13. **TC13**: Access endpoint without token returns 401
14. **TC14**: Access endpoint with valid token succeeds

### Phase 3: User Isolation

15. **TC15**: User A's recipes not visible to User B
16. **TC16**: User A's sync collections not visible to User B
17. **TC17**: User A's sync state not visible to User B
18. **TC18**: User preferences stored per-user
19. **TC19**: Update user preferences only affects current user
20. **TC20**: Admin endpoint fails for non-admin user

### Phase 4: Telegram Integration

21. **TC21**: Telegram account can be linked to user
22. **TC22**: Linked user identified by telegram_user_id
23. **TC23**: Unlink removes telegram_user_id
24. **TC24**: Link code expires after 10 minutes
25. **TC25**: Link code deleted after use (one-time)

### Phase 5: Data Migration

26. **TC26**: Single-user data migrated to admin user during upgrade
27. **TC27**: Existing recipes assigned to admin user
28. **TC28**: Existing sync state assigned to admin user
29. **TC29**: Admin user marked as is_admin=true

## Configuration

**`.env` example:**

```bash
# JWT Configuration
JWT_SECRET_KEY=your-super-secret-key-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Redis (for link codes)
REDIS_URL=redis://localhost:6379/0

# CORS (allow frontend origin)
FRONTEND_URL=http://localhost:5173

# User registration settings
USER_REGISTRATION_ENABLED=true  # Allow new signups
DEFAULT_USER_LANGUAGE=de  # Default language for new users
```

## Database Migrations Path

1. **Migration 011**: Create `users` table
2. **Migration 012**: Create `user_preferences` table
3. **Migration 013**: Update `admin_users` to link to `users` table
4. **Migration 014**: Add `user_id` columns to existing tables:
   - recipes
   - import_queue_jobs
   - instagram_sync_collections
   - instagram_sync_state
5. **Migration 015**: Populate `user_id` for existing data (assign to admin)
6. **Migration 016**: Add foreign key constraints

## Assumptions & Design Decisions

### 1. Authentication Method: JWT
- **Decision**: Use JWT tokens (stateless, simple to scale)
- **Alternative**: Session-based auth, OAuth2
- **Rationale**: Stateless tokens work well with async workers, frontend can store in localStorage
- **Trade-off**: Need refresh token rotation, need HTTPS in production

### 2. Password Hashing: bcrypt
- **Decision**: Use bcrypt with passlib
- **Alternative**: argon2, scrypt
- **Rationale**: Standard, well-tested, passlib handles rotation

### 3. Telegram Linking: Code-based
- **Decision**: User generates code with `/link`, enters on web
- **Alternative**: Bot-initiated linking, OAuth2
- **Rationale**: Simple UX, avoids passing credentials through chat
- **Trade-off**: Requires 2 interactions (code generation + web entry)

### 4. Per-User Data Isolation: Database queries
- **Decision**: Add `user_id` filters to all SELECT queries
- **Alternative**: Row-level security (RLS) in PostgreSQL
- **Rationale**: Explicit filtering is clearer, easier to test
- **Trade-off**: Requires discipline (can't forget user_id filter)

### 5. Multi-User Rollout: Gradual
- **Decision**: Deploy with registration enabled, but only admin can sync initially
- **Alternative**: Beta access, invite-only
- **Rationale**: Flexible, can enable features per-user
- **Trade-off**: Need feature flags for gradual rollout

## Success Criteria

- ✅ Users can register with email/password
- ✅ Users can login and receive JWT token
- ✅ Frontend stores token and includes in API requests
- ✅ Endpoints require valid JWT token (401 without)
- ✅ User A cannot see User B's recipes
- ✅ User A cannot see User B's sync collections
- ✅ User can link Telegram account via code + website
- ✅ Telegram bot recognizes linked users
- ✅ User preferences stored per-user (language, theme, etc.)
- ✅ Admin user can be marked and granted special permissions
- ✅ Existing single-admin data migrated to admin user account
- ✅ 29 TDD tests all passing
- ✅ Public user registration enabled (with email verification TBD)
- ✅ Password reset flow (TBD)
- ✅ Multi-user sync workers work independently

## Future Enhancements

- [ ] Email verification on registration
- [ ] Password reset / forgot password
- [ ] Two-factor authentication (2FA)
- [ ] OAuth2 / social login (Google, GitHub)
- [ ] Session management (view/revoke active sessions)
- [ ] Audit log of user actions
- [ ] Granular admin permissions (roles)
- [ ] User profiles (bio, avatar)
- [ ] Recipe sharing between users
- [ ] Collaboration on shared recipes
- [ ] API keys for external integrations
- [ ] Rate limiting per user

## Known Constraints & Risks

- **Single Instagram account**: All users share same cookies (can't have separate Instagram accounts)
  - Mitigation: Document as limitation; future: per-user Instagram linking
- **Password reset**: Not yet implemented
  - Mitigation: Use "forgot password" link (TBD)
- **Email verification**: Not yet implemented
  - Risk: Anyone can register with fake email
  - Mitigation: Add email verification on registration
- **Telegram unlinking**: No way to unlink currently
  - Mitigation: Add `/unlink` command
- **JWT token expiry**: Tokens expire after 30 min
  - Mitigation: Use refresh tokens (TBD on frontend)

## Migration Strategy

### Week 1: Implement & Test
1. Createfeature branch `feature/multi-user-authentication`
2. Implement auth routes (register, login, JWT)
3. Add dependencies and middleware
4. Write 29 TDD tests
5. Deploy to staging

### Week 2: Gradual Rollout
1. Enable user registration (web interface)
2. Existing admin continues to work (single-user mode)
3. New users can register but can't sync (feature flag)
4. Monitor for bugs

### Week 3: Full Multi-User
1. Enable sync for all users
2. Migrate existing data to admin user
3. Update documentation
4. Announce feature to users

## Related Issues

- Depends on: Telegram bot backend feature (feature/telegram-bot-backend)
- Blocks: Recipe sharing feature (will need user IDs)
- Related: Instagram sync worker (already multi-user ready)

## PR Checklist

Before creating PR to `main`:
- [ ] All tests pass (TC1-TC29)
- [ ] JWT token generation and validation tested
- [ ] User isolation verified (A can't see B's data)
- [ ] Registration page functional
- [ ] Login page functional
- [ ] Password reset flow implemented (or issue for future)
- [ ] Telegram account linking works
- [ ] `/link` command generates code
- [ ] Frontend includes auth header in API requests
- [ ] 401 responses trigger token refresh
- [ ] Admin user confirmed is_admin=true
- [ ] Redis connection tested (for link codes)
- [ ] CORS configured for frontend origin
- [ ] No regressions in existing features
- [ ] Graceful error messages (user-friendly)
- [ ] Security review passed (password hashing, token validation)
