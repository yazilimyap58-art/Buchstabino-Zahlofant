// Löst nach `ms` auf, falls `promise` bis dahin nicht selbst fertig ist.
export function withTimeout(promise, ms) {
  const timeout = new Promise(resolve => setTimeout(resolve, ms));
  return Promise.race([Promise.resolve(promise).catch(() => {}), timeout]);
}
