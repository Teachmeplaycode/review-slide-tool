import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Attempt, StudySet } from '../../types'

type ReviewDb = DBSchema & {
  studySets: {
    key: string
    value: StudySet
    indexes: {
      updatedAt: number
    }
  }
  attempts: {
    key: string
    value: Attempt
    indexes: {
      studySetId: string
      createdAt: number
    }
  }
}

let dbPromise: Promise<IDBPDatabase<ReviewDb>> | null = null

export async function saveStudySet(studySet: StudySet): Promise<void> {
  const db = await getDb()
  await db.put('studySets', cloneForDb(studySet))
}

export async function listStudySets(): Promise<StudySet[]> {
  const db = await getDb()
  const sets = await db.getAllFromIndex('studySets', 'updatedAt')
  return sets.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveAttempt(attempt: Attempt): Promise<void> {
  const db = await getDb()
  await db.put('attempts', cloneForDb(attempt))
}

export async function listAttempts(studySetId: string): Promise<Attempt[]> {
  const db = await getDb()
  const attempts = await db.getAllFromIndex('attempts', 'studySetId', studySetId)
  return attempts.sort((a, b) => b.createdAt - a.createdAt)
}

async function getDb(): Promise<IDBPDatabase<ReviewDb>> {
  dbPromise ??= openDB<ReviewDb>('review-slide-tool', 1, {
    upgrade(db) {
      const studySets = db.createObjectStore('studySets', { keyPath: 'id' })
      studySets.createIndex('updatedAt', 'updatedAt')

      const attempts = db.createObjectStore('attempts', { keyPath: 'id' })
      attempts.createIndex('studySetId', 'studySetId')
      attempts.createIndex('createdAt', 'createdAt')
    },
  })

  return dbPromise
}

function cloneForDb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
