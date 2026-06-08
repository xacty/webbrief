import React from 'react';
import { Sparkles } from 'lucide-react';
import { Modal, Button } from '../ui';
import styles from './WelcomeModal.module.css';

export default function WelcomeModal({ open, onStart, onSkip }) {
  return (
    <Modal
      open={open}
      onClose={onSkip}
      size="md"
      title=""
      showCloseButton={false}
      ariaLabel="Bienvenida a WeBrief"
    >
      <div className={styles.body}>
        <span className={styles.hero} aria-hidden="true">
          <Sparkles size={32} />
        </span>
        <h2 className={styles.title}>Bienvenido a WeBrief</h2>
        <p>
          Te muestro lo esencial en 60 segundos: crear empresa, invitar al equipo y abrir tu
          primer proyecto. Puedes saltarlo y reiniciarlo desde Ajustes cuando quieras.
        </p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onSkip}>
            Saltar por ahora
          </Button>
          <Button variant="primary" onClick={onStart}>
            Empezar tour
          </Button>
        </div>
      </div>
    </Modal>
  );
}
