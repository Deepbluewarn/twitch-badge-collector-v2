export default function observer(
  obj: Element,
  config: Object,
  callback: MutationCallback
) {
  if (!obj || obj.nodeType !== 1) return;

  if (window.MutationObserver) {
    const mutationObserver = new MutationObserver(callback);
    mutationObserver.observe(obj, config);
    return mutationObserver;
  }
}
