import { useEffect, useRef, useState } from 'react';

export function useTimedMessage(timeoutMs = 2500) {
  const [message, setMessage] = useState('');
  const timeoutRef = useRef(null);

  function clearMessage() {
    setMessage('');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function showMessage(nextMessage) {
    setMessage(nextMessage);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setMessage('');
      timeoutRef.current = null;
    }, timeoutMs);
  }

  useEffect(() => () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return {
    message,
    showMessage,
    clearMessage
  };
}
