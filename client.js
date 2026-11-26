/**
 * Client half of the session-reaper bundle.
 *
 * Adds one row to the Session context menu and the confirmation dialog it
 * opens. The dialog posts to the Host route that deletes the log; the row then
 * disappears because the Host emits `api-session/removed`.
 */
window.__ModuleLoader__.load({
  id: '@Hector387420489/dsh-session-reaper',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useId } = React

    const ROUTE = '/__dsh/session-reaper/delete'

    const TEXT = {
      en: {
        'menu.delete': 'Delete session…',
        'dialog.title': 'Delete this session?',
        'dialog.body': '“{title}” is deleted from disk and cannot be recovered. It leaves this list immediately; archived or open tabs of it will be gone after a restart.',
        'dialog.untitled': 'Untitled session',
        'dialog.cancel': 'Cancel',
        'dialog.delete': 'Delete',
        'dialog.busy': 'Deleting…',
        'dialog.done': 'Deleted. The row is gone; the workspace lists it no more after a restart.',
        'dialog.close': 'Close',
      },
      zh: {
        'menu.delete': '删除会话…',
        'dialog.title': '删除这个会话？',
        'dialog.body': '「{title}」的日志将从磁盘永久删除，无法恢复。删除后该行立即消失；重启 DSH 前，它的归档筛选或残留标签页不再可用。',
        'dialog.untitled': '未命名会话',
        'dialog.cancel': '取消',
        'dialog.delete': '删除',
        'dialog.busy': '正在删除…',
        'dialog.done': '已删除。该行已移除，重启 DSH 后工作区里也不再列出它。',
        'dialog.close': '关闭',
      },
    }

    /** The bound translator; `apply` replaces it once the locale service is available. */
    let translate = key => key

    const style = {
      backdrop: {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.42))',
        pointerEvents: 'auto',
        zIndex: 1000,
      },
      card: {
        width: 'min(420px, calc(100vw - 48px))',
        boxSizing: 'border-box',
        padding: '20px 20px 16px',
        borderRadius: '14px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.28))',
        background: 'var(--dsw-alias-bg-layer-2, #26262a)',
        color: 'var(--dsw-alias-label-primary, #f2f2f2)',
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.36)',
        fontSize: '14px',
        lineHeight: 1.55,
      },
      title: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' },
      body: { color: 'var(--dsw-alias-label-secondary, #b6b6bb)', marginBottom: '14px', wordBreak: 'break-word' },
      error: { color: 'var(--dsw-alias-state-error-primary, #e5484d)', marginBottom: '12px', wordBreak: 'break-word' },
      done: { color: 'var(--dsw-alias-label-secondary, #b6b6bb)', marginBottom: '14px' },
      actions: { display: 'flex', justifyContent: 'flex-end', gap: '8px' },
      cancel: {
        padding: '6px 14px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.3))',
        background: 'transparent',
        color: 'inherit',
        fontSize: '13px',
        cursor: 'pointer',
      },
      danger: {
        padding: '6px 14px',
        borderRadius: '8px',
        border: 'none',
        background: 'var(--dsw-alias-state-error-primary, #e5484d)',
        color: '#fff',
        fontSize: '13px',
        cursor: 'pointer',
      },
    }

    /** One pending deletion, shared by the row entry and the dialog entry. */
    const store = {
      state: { request: null, phase: 'idle', message: '' },
      listeners: new Set(),
      set(patch) {
        this.state = { ...this.state, ...patch }
        for (const listener of this.listeners) listener()
      },
      subscribe(listener) {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      },
      read() {
        return this.state
      },
    }

    function useStore() {
      return React.useSyncExternalStore(
        listener => store.subscribe(listener),
        () => store.read(),
      )
    }

    function reset() {
      store.set({ request: null, phase: 'idle', message: '' })
    }

    function DeleteDialog() {
      const state = useStore()
      const titleId = useId()

      useEffect(() => {
        if (state.request === null) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (store.read().phase === 'busy') return
          reset()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [state.request])

      if (state.request === null) return null

      const name = state.request.title === '' ? translate('dialog.untitled') : state.request.title
      const busy = state.phase === 'busy'
      const done = state.phase === 'done'

      const submit = async () => {
        if (busy) return
        store.set({ phase: 'busy', message: '' })
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: state.request.sessionId }),
          })
          const payload = await response.json().catch(() => null)
          if (payload !== null && payload.ok === true) store.set({ phase: 'done', message: '' })
          else store.set({ phase: 'error', message: payload?.message ?? `HTTP ${response.status}` })
        } catch (error) {
          store.set({ phase: 'error', message: String(error?.message ?? error) })
        }
      }

      const cancel = () => {
        if (!busy) reset()
      }

      const body = done
        ? h('div', { style: style.done }, translate('dialog.done'))
        : h('div', { style: style.body }, translate('dialog.body').replace('{title}', name))

      return h(
        'div',
        {
          style: style.backdrop,
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) cancel()
          },
        },
        h(
          'div',
          { style: style.card, role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId },
          h('div', { style: style.title, id: titleId }, translate('dialog.title')),
          body,
          state.phase === 'error' ? h('div', { style: style.error }, state.message) : null,
          h(
            'div',
            { style: style.actions },
            done
              ? h('button', { type: 'button', style: style.cancel, onClick: reset }, translate('dialog.close'))
              : [
                h('button', { key: 'cancel', type: 'button', style: style.cancel, onClick: cancel, disabled: busy }, translate('dialog.cancel')),
                h(
                  'button',
                  { key: 'delete', type: 'button', style: style.danger, onClick: () => { void submit() }, disabled: busy },
                  busy ? translate('dialog.busy') : translate('dialog.delete'),
                ),
              ],
          ),
        ),
      )
    }

    /**
     * One Session context-menu row; opening it arms the dialog.
     * @param props - Owner props plus the menu's open-state hook.
     */
    function DeleteRowAction(props) {
      const closeMenuHook = typeof props.useMenuOpenState === 'function'
        ? props.useMenuOpenState
        : () => [false, () => {}]
      const [, setMenuOpen] = closeMenuHook()
      return h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          style: {
            display: 'block',
            width: '100%',
            padding: '6px 10px',
            border: 'none',
            borderRadius: '6px',
            background: 'transparent',
            color: 'var(--dsw-alias-state-error-primary, #e5484d)',
            fontSize: '13px',
            textAlign: 'left',
            cursor: 'pointer',
          },
          onClick: () => {
            setMenuOpen(false)
            store.set({
              request: { sessionId: props.sessionId, title: props.displayTitle ?? '' },
              phase: 'idle',
              message: '',
            })
          },
        },
        translate('menu.delete'),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        translate = ctx.locale.bind('sessionReaper')
        ctx.effect(() => ctx.locale.register('sessionReaper', TEXT), 'session-reaper: locale')
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register(
          { name: 'sidebar.workspaces.session.menu.item', id: 'session-reaper.delete', order: 700 },
          DeleteRowAction,
        ))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register(
          { name: 'shell.overlay', id: 'session-reaper.dialog', order: 1000 },
          DeleteDialog,
        ))
      },
    }
  },
})
