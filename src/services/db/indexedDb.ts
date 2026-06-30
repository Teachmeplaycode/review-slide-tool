import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Attempt, GradedQuestion, QuestionReviewStat, StudyAsset, StudySet } from '../../types'

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
  reviewStats: {
    key: string
    value: QuestionReviewStat
    indexes: {
      studySetId: string
      updatedAt: number
    }
  }
  assets: {
    key: string
    value: StudyAsset
    indexes: {
      studySetId: string
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

export async function recordReviewStats(
  studySetId: string,
  results: GradedQuestion[],
  attemptedAt = Date.now(),
): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('reviewStats', 'readwrite')
  const store = tx.objectStore('reviewStats')

  for (const result of results) {
    const id = createReviewStatId(studySetId, result.question.id)
    const previous = await store.get(id)
    const isCorrect = result.status === 'correct'
    const isReview = result.status === 'partial' || result.status === 'review'
    const isWrong = result.status === 'wrong'

    const next: QuestionReviewStat = {
      id,
      studySetId,
      questionId: result.question.id,
      attempts: (previous?.attempts ?? 0) + 1,
      correctCount: (previous?.correctCount ?? 0) + (isCorrect ? 1 : 0),
      reviewCount: (previous?.reviewCount ?? 0) + (isReview ? 1 : 0),
      wrongCount: (previous?.wrongCount ?? 0) + (isWrong ? 1 : 0),
      correctStreak: isCorrect ? (previous?.correctStreak ?? 0) + 1 : 0,
      lastStatus: result.status,
      lastScore: result.score,
      lastAttemptAt: attemptedAt,
      updatedAt: attemptedAt,
    }

    await store.put(next)
  }

  await tx.done
}

export async function listAttempts(studySetId: string): Promise<Attempt[]> {
  const db = await getDb()
  const attempts = await db.getAllFromIndex('attempts', 'studySetId', studySetId)
  return attempts.sort((a, b) => b.createdAt - a.createdAt)
}

export async function listReviewStats(studySetId: string): Promise<QuestionReviewStat[]> {
  const db = await getDb()
  const stats = await db.getAllFromIndex('reviewStats', 'studySetId', studySetId)
  return stats.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveStudyAssets(assets: StudyAsset[]): Promise<void> {
  if (!assets.length) return
  const db = await getDb()
  const tx = db.transaction('assets', 'readwrite')
  await Promise.all(assets.map((asset) => tx.objectStore('assets').put(asset)))
  await tx.done
}

export async function listStudyAssets(studySetId: string): Promise<StudyAsset[]> {
  const db = await getDb()
  return db.getAllFromIndex('assets', 'studySetId', studySetId)
}

export async function deleteStudyAssets(studySetId: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('assets', 'readwrite')
  const index = tx.objectStore('assets').index('studySetId')
  let cursor = await index.openCursor(studySetId)

  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }

  await tx.done
}

export async function clearStudySets(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['studySets', 'attempts', 'reviewStats', 'assets'], 'readwrite')
  await Promise.all([
    tx.objectStore('studySets').clear(),
    tx.objectStore('attempts').clear(),
    tx.objectStore('reviewStats').clear(),
    tx.objectStore('assets').clear(),
  ])
  await tx.done
}

async function getDb(): Promise<IDBPDatabase<ReviewDb>> {
  dbPromise ??= openDB<ReviewDb>('review-slide-tool', 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('studySets')) {
        const studySets = db.createObjectStore('studySets', { keyPath: 'id' })
        studySets.createIndex('updatedAt', 'updatedAt')
      }

      if (!db.objectStoreNames.contains('attempts')) {
        const attempts = db.createObjectStore('attempts', { keyPath: 'id' })
        attempts.createIndex('studySetId', 'studySetId')
        attempts.createIndex('createdAt', 'createdAt')
      }

      if (!db.objectStoreNames.contains('reviewStats')) {
        const reviewStats = db.createObjectStore('reviewStats', { keyPath: 'id' })
        reviewStats.createIndex('studySetId', 'studySetId')
        reviewStats.createIndex('updatedAt', 'updatedAt')
      }

      if (!db.objectStoreNames.contains('assets')) {
        const assets = db.createObjectStore('assets', { keyPath: 'id' })
        assets.createIndex('studySetId', 'studySetId')
      }
    },
  })

  return dbPromise
}

function createReviewStatId(studySetId: string, questionId: string): string {
  return `${studySetId}::${questionId}`
}

function cloneForDb<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
