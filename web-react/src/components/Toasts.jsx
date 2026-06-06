import { useEffect, useState } from 'react';

function Toast({ msg }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className={'toast' + (show ? ' show' : '')}>
      <span className="tk">✓</span> <span>{msg}</span>
    </div>
  );
}

export default function Toasts({ items }) {
  return (
    <>
      {items.map((t) => (
        <Toast key={t.id} msg={t.msg} />
      ))}
    </>
  );
}
