export async function withRetry(task, { retries = 2, baseDelayMs = 200 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function withTimeout(task, timeoutMs = 12000) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
  });
  return Promise.race([task(), timeoutPromise]);
}
