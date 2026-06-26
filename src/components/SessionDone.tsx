import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface SessionDoneProps {
  onStartAgain: () => void;
}

export function SessionDone({ onStartAgain }: SessionDoneProps) {
  const navigate = useNavigate();

  const handleStartAgain = () => {
    onStartAgain();
    navigate('/setup');
  };

  return (
    <motion.div
      className="screen screen-setup"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: '1.75rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '12px',
        }}
      >
        Session complete
      </h1>
      <p
        style={{
          color: 'var(--text-muted)',
          marginBottom: '32px',
          maxWidth: '320px',
        }}
      >
        You can start another session when ready.
      </p>
      <motion.button
        type="button"
        onClick={handleStartAgain}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        style={{
          background: 'linear-gradient(135deg, #D9C478, #c4a85e)',
          color: '#0c0a0e',
          border: 'none',
          borderRadius: '12px',
          padding: '14px 32px',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 20px hsl(45 50% 50% / 0.25)',
        }}
      >
        Start again
      </motion.button>
    </motion.div>
  );
}
