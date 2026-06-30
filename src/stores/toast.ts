import { defineStore } from 'pinia'

export type ToastKind = 'success' | 'info' | 'error'

export type ToastMessage = {
  id: string
  kind: ToastKind
  message: string
}

let toastSeed = 0

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: [] as ToastMessage[],
  }),

  actions: {
    show(message: string, kind: ToastKind = 'info') {
      const id = `toast_${Date.now()}_${toastSeed}`
      toastSeed += 1
      this.items.push({ id, kind, message })

      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          this.dismiss(id)
        }, 4200)
      }
    },

    success(message: string) {
      this.show(message, 'success')
    },

    info(message: string) {
      this.show(message, 'info')
    },

    error(message: string) {
      this.show(message, 'error')
    },

    dismiss(id: string) {
      this.items = this.items.filter((item) => item.id !== id)
    },
  },
})
