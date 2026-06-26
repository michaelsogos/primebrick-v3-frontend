interface PendingRequest {
  input: RequestInfo | URL;
  init: RequestInit;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
}

const _state = $state({
  isOpen: false,
  pendingRequests: [] as PendingRequest[],
  hasFailedAttempt: false,
});

export const sessionExpiredStore = {
  get isOpen() { return _state.isOpen; },
  get hasFailedAttempt() { return _state.hasFailedAttempt; },
  get pendingCount() { return _state.pendingRequests.length; },

  /** Enqueue a failed request and open the dialog. Returns a Promise that resolves when the request is retried. */
  enqueue(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
    _state.isOpen = true;
    return new Promise((resolve, reject) => {
      _state.pendingRequests.push({ input, init, resolve, reject });
    });
  },

  /** Drain all pending requests (called after successful login). */
  drainPending(): PendingRequest[] {
    const pending = [..._state.pendingRequests];
    _state.pendingRequests = [];
    return pending;
  },

  /** Mark the last login attempt as failed (shows error alert + "Go to login page" button). */
  setFailed() { _state.hasFailedAttempt = true; },

  /** Close dialog and reset state (called after successful login or manual close). */
  close() {
    _state.isOpen = false;
    _state.hasFailedAttempt = false;
  },
};
