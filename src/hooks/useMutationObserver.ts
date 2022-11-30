import React from "react";

export default function useMutationObserver(
  ref: React.RefObject<HTMLElement>,
  callback: (mutationRecord: MutationRecord[]) => void,
  options = {
    attributes: true,
    attributeFilter: ["class"],
  }
) {
  React.useEffect(() => {
    if (ref.current) {
      const observer = new MutationObserver(callback);
      observer.observe(ref.current, options);

      return () => observer.disconnect();
    }
  }, [callback, options]);
}
