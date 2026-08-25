# Family Grocery List 🛒

A minimalist, real-time shared grocery list designed for families.

Open link → see grocery items → add/check/update items → everyone sees changes instantly across all devices.

No accounts. No passwords. No email. No onboarding. Just bookmark or share in WhatsApp.

---

## 🌟 Core Features

- **Instant Shared Link**: Cryptographically random URL serves as the access key. Anyone with the link can view and edit.
- **Real-Time Collaboration**: Powered by Supabase Realtime (with seamless cross-tab broadcast fallback for local testing).
- **Optimistic UI**: Instant item toggling, adding, inline editing, and deletion without waiting for network round-trips.
- **5-Second Undo**: Accidental deletions can be instantly undone via a subtle toast notification.
- **Mobile-First & Large Touch Targets**: 44×44px minimum touch targets designed for comfortable one-handed mobile and tablet use.
- **Rapid Keyboard Entry**: Type "Milk" → `Enter` → "Bread" → `Enter` — focus remains locked on the input for rapid-fire grocery entry.
- **Unicode & Multilingual**: Seamless support for emojis (🥛, 🥔), Hindi (दूध), Hinglish, and special characters.
- **PWA Ready**: Installable to iOS/Android home screens as a standalone utility.
- **Connection Awareness**: Visual indicator (`● Live` / `Offline`) and network resilience.

---

## 🛠️ Tech Stack

- **Frontend**: [Next.js](https://nextjs.org/) (App Router), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL + Supabase Realtime)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Hosting**: Vercel (Frontend) + Supabase (Database/Realtime)

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd family-grocery-list
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

*(Note: If you run the app without Supabase credentials, it automatically falls back to an offline/local tab-synced store for instant previewing and testing!)*

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🗄️ Supabase Setup & Database Migration

1. Create a new project in [Supabase](https://app.supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Open [`supabase/schema.sql`](./supabase/schema.sql) from this repository and run the SQL query.
4. The schema sets up:
   - `grocery_lists` table with unique `share_token`
   - `grocery_items` table with `position`, `completed`, `name`, `quantity`
   - Performance indexes on `(list_id, position)`
   - Auto-updating `updated_at` triggers
   - Row Level Security (RLS) policies allowing safe access via list IDs
   - Realtime publication on `grocery_items` and `grocery_lists`
5. Copy your **Project URL** and **Anon Public Key** from **Settings → API** and paste them into `.env.local`.

---

## 🔒 Security Model

- **Public Anon Key only**: Browser code only communicates using Supabase's safe public anon key. The service role key is never exposed.
- **Row Level Security (RLS)**: Enforces that items can only be read, modified, or deleted within valid lists, preventing bulk data enumeration.
- **Access Credential**: The unique random list identifier serves as the trusted shared household key.

---

## 📦 Deployment to Vercel

1. Push this repository to GitHub / GitLab.
2. Import the repository into [Vercel](https://vercel.com).
3. Add the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variables in Vercel project settings.
4. Deploy!
