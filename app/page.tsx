'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type Todo = {
  id: number
  title: string
  is_complete: boolean
  remarque: string | null
  due_date: string | null
  priorite?: string
  sujet?: string
  user_id: string
}

type SharedSubject = {
  id: string
  owner_id: string
  sujet: string
  shared_with_email: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITE_STYLES: Record<string, string> = {
  élevée: 'text-red-500 bg-red-50',
  moyenne: 'text-orange-400 bg-orange-50',
  basse:   'text-green-500 bg-green-50',
}
const PRIORITE_ORDER: Record<string, number> = { élevée: 0, moyenne: 1, basse: 2 }
const SUJETS_DEFAULT = ['e-com', 'prévention', 'courses']
const LS_KEY = 'todo-sujets'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortByPriorite(todos: Todo[]): Todo[] {
  return [...todos].sort(
    (a, b) => (PRIORITE_ORDER[a.priorite ?? ''] ?? 3) - (PRIORITE_ORDER[b.priorite ?? ''] ?? 3)
  )
}

function groupBySujet(todos: Todo[]): [string, Todo[]][] {
  const map = new Map<string, Todo[]>()
  for (const todo of todos) {
    const key = todo.sujet?.trim() || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(todo)
  }
  const named = [...map.entries()]
    .filter(([k]) => k !== '')
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
  const empty = map.has('') ? [['Sans sujet', map.get('')!] as [string, Todo[]]] : []
  return [...named, ...empty].map(([k, items]) => [k, sortByPriorite(items)])
}

// ─── SujetSelect ──────────────────────────────────────────────────────────────

function SujetSelect({
  value, sujets, onSelect, onNewSujet, className,
}: {
  value: string
  sujets: string[]
  onSelect: (v: string) => void
  onNewSujet: (v: string) => void
  className?: string
}) {
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')

  function confirm() {
    const s = input.trim()
    if (s) { onNewSujet(s); onSelect(s) }
    setAdding(false)
    setInput('')
  }

  if (adding) {
    return (
      <input
        type="text" value={input} autoFocus
        onChange={(e) => setInput(e.target.value)}
        onBlur={confirm}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirm()
          if (e.key === 'Escape') { setAdding(false); setInput('') }
        }}
        placeholder="Nouveau sujet..."
        className={className}
      />
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => e.target.value === '__add__' ? setAdding(true) : onSelect(e.target.value)}
      className={className}
    >
      <option value="">Sans sujet</option>
      {sujets.map((s) => <option key={s} value={s}>{s}</option>)}
      <option value="__add__">Ajouter un sujet...</option>
    </select>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter()

  const [user, setUser]               = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [todos, setTodos]             = useState<Todo[]>([])
  const [loading, setLoading]         = useState(true)
  const [newTask, setNewTask]         = useState('')
  const [newPriorite, setNewPriorite] = useState('moyenne')
  const [newSujet, setNewSujet]       = useState('')
  const [sujets, setSujets]           = useState<string[]>(SUJETS_DEFAULT)
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [archivesOpen, setArchivesOpen] = useState(false)
  const [sharedSubjects, setSharedSubjects] = useState<SharedSubject[]>([])
  const [openShareSujet, setOpenShareSujet] = useState<string | null>(null)
  const [shareEmail, setShareEmail]   = useState('')

  // ─── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setUser(session.user)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) router.replace('/login')
      else setUser(session.user)
    })
    return () => subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) { try { setSujets(JSON.parse(stored)) } catch {} }
  }, [])

  useEffect(() => {
    if (!authLoading) { fetchTodos(); fetchSharedSubjects() }
  }, [authLoading])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  // ─── Data ──────────────────────────────────────────────────────────────────

  async function fetchTodos() {
    const { data, error } = await supabase.from('todos').select('*').order('id', { ascending: true })
    if (error) console.error('[fetchTodos]', error)
    setTodos(data ?? [])
    setLoading(false)
  }

  async function fetchSharedSubjects() {
    const { data, error } = await supabase.from('shared_subjects').select('*')
    if (error) console.error('[fetchSharedSubjects]', error)
    setSharedSubjects(data ?? [])
  }

  function addSujet(s: string) {
    setSujets((prev) => {
      if (prev.includes(s)) return prev
      const next = [...prev, s]
      localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
  }

  // ─── Todo CRUD ─────────────────────────────────────────────────────────────

  async function addTodo() {
    const task = newTask.trim()
    if (!task) return
    const { data, error } = await supabase
      .from('todos')
      .insert({ title: task, is_complete: false, remarque: null, priorite: newPriorite, sujet: newSujet || null, user_id: user!.id })
      .select().single()
    if (error) { console.error('Supabase error:', JSON.stringify(error)); return }
    setTodos((prev) => [...prev, data])
    setNewTask(''); setNewPriorite('moyenne'); setNewSujet('')
  }

  async function toggleTodo(todo: Todo) {
    const { data, error } = await supabase.from('todos').update({ is_complete: !todo.is_complete }).eq('id', todo.id).select().single()
    if (error) console.error('[toggleTodo]', error)
    else setTodos((prev) => prev.map((t) => (t.id === data.id ? data : t)))
  }

  async function deleteTodo(id: number) {
    const { error } = await supabase.from('todos').delete().eq('id', id)
    if (error) console.error('[deleteTodo]', error)
    else setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  async function saveTitle(todo: Todo) {
    const title = editingTitle.trim()
    setEditingId(null)
    if (!title || title === todo.title) return
    const { data, error } = await supabase.from('todos').update({ title }).eq('id', todo.id).select().single()
    if (error) console.error('[saveTitle]', error)
    else setTodos((prev) => prev.map((t) => (t.id === data.id ? data : t)))
  }

  async function saveRemarque(todo: Todo, value: string) {
    const remarque = value.trim() || null
    if (remarque === todo.remarque) return
    const { data, error } = await supabase.from('todos').update({ remarque }).eq('id', todo.id).select().single()
    if (error) console.error('[saveRemarque]', error)
    else setTodos((prev) => prev.map((t) => (t.id === data.id ? data : t)))
  }

  async function savePriorite(todo: Todo, value: string) {
    const { data, error } = await supabase.from('todos').update({ priorite: value }).eq('id', todo.id).select().single()
    if (error) console.error('[savePriorite]', error)
    else setTodos((prev) => prev.map((t) => (t.id === data.id ? data : t)))
  }

  async function saveSujet(todo: Todo, value: string) {
    const sujet = value || null
    if (sujet === (todo.sujet ?? null)) return
    const { data, error } = await supabase.from('todos').update({ sujet }).eq('id', todo.id).select().single()
    if (error) console.error('[saveSujet]', error)
    else setTodos((prev) => prev.map((t) => (t.id === data.id ? data : t)))
  }

  async function saveDueDate(todo: Todo, value: string) {
    const due_date = value || null
    if (due_date === todo.due_date) return
    const { data, error } = await supabase.from('todos').update({ due_date }).eq('id', todo.id).select().single()
    if (error) console.error('[saveDueDate]', error)
    else setTodos((prev) => prev.map((t) => (t.id === data.id ? data : t)))
  }

  // ─── Sharing ───────────────────────────────────────────────────────────────

  async function handleShare(sujet: string) {
    const email = shareEmail.trim()
    if (!email) return
    const { error } = await supabase.from('shared_subjects').insert({ owner_id: user!.id, sujet, shared_with_email: email })
    if (error) console.error('[shareSubject]', error)
    else { fetchSharedSubjects(); setShareEmail('') }
  }

  async function unshareSubject(id: string) {
    const { error } = await supabase.from('shared_subjects').delete().eq('id', id)
    if (error) console.error('[unshareSubject]', error)
    else setSharedSubjects((prev) => prev.filter((s) => s.id !== id))
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  if (authLoading) return null

  const active   = todos.filter((t) => !t.is_complete)
  const archived = todos.filter((t) =>  t.is_complete)
  const grouped         = groupBySujet(active)
  const groupedArchived = groupBySujet(archived)
  const sc = 'text-xs text-gray-400 border-b border-transparent hover:border-gray-200 focus:border-blue-300 focus:outline-none bg-transparent py-0.5 transition-colors'

  const renderTodoItem = (todo: Todo) => {
    const isOwn = todo.user_id === user?.id
    return (
      <li key={todo.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
        <input
          type="checkbox"
          checked={todo.is_complete}
          onChange={() => isOwn && toggleTodo(todo)}
          disabled={!isOwn}
          className={`w-4 h-4 mt-0.5 accent-blue-500 flex-shrink-0 ${isOwn ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isOwn && editingId === todo.id ? (
              <input
                type="text" value={editingTitle} autoFocus
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => saveTitle(todo)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(todo); if (e.key === 'Escape') setEditingId(null) }}
                className="flex-1 text-sm text-gray-700 border-b border-blue-300 focus:outline-none bg-transparent py-0.5"
              />
            ) : (
              <span
                onClick={() => isOwn && (setEditingId(todo.id), setEditingTitle(todo.title))}
                className={`text-sm transition-colors ${isOwn ? 'cursor-pointer hover:text-blue-500' : 'cursor-default'} ${todo.is_complete ? 'line-through text-gray-400' : 'text-gray-700'}`}
              >
                {todo.title}
              </span>
            )}
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${PRIORITE_STYLES[todo.priorite ?? 'moyenne']}`}>
              {todo.priorite ?? 'moyenne'}
            </span>
            {!isOwn && (
              <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded flex-shrink-0">
                Partagé
              </span>
            )}
          </div>
          {isOwn ? (
            <>
              <SujetSelect value={todo.sujet ?? ''} sujets={sujets} onSelect={(v) => saveSujet(todo, v)} onNewSujet={addSujet} className={`mt-1 ${sc}`} />
              <select value={todo.priorite ?? 'moyenne'} onChange={(e) => savePriorite(todo, e.target.value)} className={`mt-1 ${sc}`}>
                <option value="élevée">Élevée</option>
                <option value="moyenne">Moyenne</option>
                <option value="basse">Basse</option>
              </select>
              <input type="text" defaultValue={todo.remarque ?? ''} onBlur={(e) => saveRemarque(todo, e.target.value)} placeholder="Ajouter une remarque..." className={`mt-1 w-full ${sc} text-gray-500 placeholder-gray-300`} />
              <input type="date" defaultValue={todo.due_date ?? ''} onBlur={(e) => saveDueDate(todo, e.target.value)} className={`mt-1 ${sc}`} />
            </>
          ) : (
            todo.remarque && <p className="mt-1 text-xs text-gray-400 italic">{todo.remarque}</p>
          )}
        </div>
        {isOwn && (
          <button onClick={() => deleteTodo(todo.id)} className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none flex-shrink-0" aria-label="Supprimer">
            &times;
          </button>
        )}
      </li>
    )
  }

  const renderGroups = (groups: [string, Todo[]][], showShare: boolean) => (
    <div className="space-y-6">
      {groups.map(([sujet, items]) => (
        <div key={sujet}>
          <div className="flex items-center justify-between mb-2 border-b border-gray-100 pb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{sujet}</h2>
            {showShare && sujet !== 'Sans sujet' && (
              <button
                onClick={() => { setOpenShareSujet(openShareSujet === sujet ? null : sujet); setShareEmail('') }}
                className="text-xs text-blue-400 hover:text-blue-600 transition-colors"
              >
                {openShareSujet === sujet ? 'Fermer' : '🔗 Partager'}
              </button>
            )}
          </div>
          {showShare && openShareSujet === sujet && (
            <div className="mb-3 bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700 mb-2">Partagé avec :</p>
              {sharedSubjects.filter((s) => s.sujet === sujet).length === 0 ? (
                <p className="text-xs text-gray-400 mb-2">Personne pour l'instant.</p>
              ) : (
                sharedSubjects.filter((s) => s.sujet === sujet).map((s) => (
                  <div key={s.id} className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600">{s.shared_with_email}</span>
                    <button onClick={() => unshareSubject(s.id)} className="text-xs text-red-400 hover:text-red-600 ml-2">&times;</button>
                  </div>
                ))
              )}
              <div className="flex gap-1 mt-2">
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleShare(sujet)}
                  placeholder="email@exemple.com"
                  className="flex-1 border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => handleShare(sujet)}
                  className="bg-blue-500 text-white text-xs px-2 py-1 rounded hover:bg-blue-600 transition-colors"
                >
                  Partager
                </button>
              </div>
            </div>
          )}
          <ul className="space-y-2">{items.map(renderTodoItem)}</ul>
        </div>
      ))}
    </div>
  )

  // ─── JSX ───────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 flex items-start justify-center pt-20 px-4 pb-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-md p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Ma Todo List</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden sm:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="text-xs text-gray-400 hover:text-red-400 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Add todo */}
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex gap-2">
            <input
              type="text" value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTodo()}
              placeholder="Nouvelle tâche..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <select
              value={newPriorite}
              onChange={(e) => setNewPriorite(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="élevée">Élevée</option>
              <option value="moyenne">Moyenne</option>
              <option value="basse">Basse</option>
            </select>
            <button
              onClick={addTodo}
              className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Ajouter
            </button>
          </div>
          <SujetSelect
            value={newSujet} sujets={sujets} onSelect={setNewSujet} onNewSujet={addSujet}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Active todos */}
        {loading ? (
          <p className="text-sm text-gray-400 text-center">Chargement...</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-gray-400 text-center">Aucune tâche pour l'instant.</p>
        ) : renderGroups(grouped, true)}

        {/* Archives */}
        {!loading && archived.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setArchivesOpen((o) => !o)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors w-full border-t border-gray-100 pt-4"
            >
              <span className={`transition-transform duration-200 inline-block ${archivesOpen ? 'rotate-90' : ''}`}>▶</span>
              Archives
              <span className="ml-auto text-xs font-normal text-gray-300">
                {archived.length} tâche{archived.length > 1 ? 's' : ''}
              </span>
            </button>
            {archivesOpen && (
              <div className="mt-4 opacity-70">
                {renderGroups(groupedArchived, false)}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
