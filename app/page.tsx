'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createList } from '@/lib/supabase/groceryLists';
import { Plus, ArrowRight, ShoppingCart } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [recentLists, setRecentLists] = useState<{ id: string; title: string; updatedAt: string }[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('fgl_recent_lists');
      if (stored) {
        setRecentLists(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const handleCreateList = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const list = await createList('Family Grocery List');
      router.push(`/list/${list.id}`);
    } catch (err) {
      console.error('Failed to create list:', err);
      setIsCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-neutral-900 flex flex-col justify-center items-center px-4 py-12 selection:bg-neutral-900 selection:text-white">
      <div className="w-full max-w-md mx-auto flex flex-col items-center text-center">
        {/* App Logo / Icon */}
        <div className="w-16 h-16 rounded-3xl bg-neutral-900 text-white flex items-center justify-center shadow-lg shadow-neutral-900/10 mb-6">
          <ShoppingCart className="w-8 h-8 stroke-[2.2]" />
        </div>

        {/* Title & Tagline */}
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">
          Family Grocery List
        </h1>
        <p className="text-base sm:text-lg text-neutral-500 mt-2.5 max-w-xs font-normal">
          A simple shared grocery list for your family.
        </p>

        {/* Primary Action Button */}
        <div className="w-full mt-8">
          <button
            onClick={handleCreateList}
            disabled={isCreating}
            className="w-full h-14 rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:scale-[0.98] text-white font-semibold text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-md shadow-neutral-900/10 transition-all disabled:opacity-60"
          >
            {isCreating ? (
              <span>Creating your list...</span>
            ) : (
              <>
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>Create New List</span>
              </>
            )}
          </button>
        </div>

        {/* Feature bullet reassuring simplicity */}
        <p className="text-xs text-neutral-400 mt-4">
          No account or login required. Just share the link.
        </p>

        {/* Recent Lists (if user previously used lists on this browser) */}
        {recentLists.length > 0 && (
          <div className="w-full mt-10 text-left pt-6 border-t border-neutral-200/80 animate-in fade-in duration-300">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 px-1">
              Recently Opened
            </h2>
            <div className="flex flex-col gap-2">
              {recentLists.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  href={`/list/${item.id}`}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-neutral-200/80 hover:border-neutral-300 text-neutral-900 font-medium transition-all group"
                >
                  <span className="truncate">{item.title || 'Family Grocery List'}</span>
                  <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
