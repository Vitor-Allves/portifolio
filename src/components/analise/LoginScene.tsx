"use client";

import { useRef, useState } from "react";
import LegadoLogoMark from "./LegadoLogoMark";
import LoginForm, { type LoginVisualEvent } from "./LoginForm";
import styles from "./LoginScene.module.css";

type Pose = "ola" | "olhos" | "duvida" | "conquista";

const LINES: Record<string, string> = {
  idle: "Bem-vindo ao Legado Intelligence.",
  usuario: "Comece pelo seu usuário.",
  usuarioOk: "Boa! Agora a senha.",
  senha: "Pode digitar. Não estamos olhando.",
  visivel: "Senha à mostra. Confira quem está por perto.",
  checando: "Conferindo o seu acesso…",
  erro: "Algo não bateu. Confira o usuário e a senha.",
  ok: "Tudo certo! Abrindo o seu painel.",
  reset: "A gente ajuda a criar uma nova senha.",
  verify: "Confirme o código do seu aplicativo autenticador.",
  enroll: "Vamos configurar a verificação em duas etapas.",
};

const TITAN_ALT: Record<Pose, string> = {
  ola: "Titan, mascote da Legado, acenando",
  olhos: "Titan, mascote da Legado, cobrindo os olhos",
  duvida: "Titan, mascote da Legado, em dúvida",
  conquista: "Titan, mascote da Legado, comemorando",
};
const LEGACY_ALT: Record<Pose, string> = {
  ola: "Legacy, mascote da Legado, acenando",
  olhos: "Legacy, mascote da Legado, cobrindo os olhos",
  duvida: "Legacy, mascote da Legado, em dúvida",
  conquista: "Legacy, mascote da Legado, comemorando",
};
const POSES: Pose[] = ["ola", "olhos", "duvida", "conquista"];

function Character({ side, pose }: { side: "titan" | "legacy"; pose: Pose }) {
  const alt = side === "titan" ? TITAN_ALT : LEGACY_ALT;
  return (
    <>
      {POSES.map((p) => (
        <img
          key={p}
          src={`/login/${side}-${p}.webp`}
          alt={alt[p]}
          className={p === pose ? styles.show : ""}
        />
      ))}
    </>
  );
}

export default function LoginScene() {
  const [pose, setPose] = useState<Pose>("ola");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [win, setWin] = useState(false);
  const [bubbleText, setBubbleText] = useState(LINES.idle);
  const [bubbleSwap, setBubbleSwap] = useState(false);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function say(key: keyof typeof LINES) {
    const text = LINES[key];
    setBubbleText((current) => {
      if (current === text) return current;
      setBubbleSwap(true);
      if (swapTimer.current) clearTimeout(swapTimer.current);
      swapTimer.current = setTimeout(() => {
        setBubbleText(text);
        setBubbleSwap(false);
      }, 150);
      return current;
    });
  }

  function handleVisualEvent(event: LoginVisualEvent) {
    switch (event.type) {
      case "focus":
        if (event.field === "username") {
          setPose("ola");
          say(step >= 1 ? "usuarioOk" : "usuario");
        } else {
          setPose(passwordVisible ? "ola" : "olhos");
          say(passwordVisible ? "visivel" : "senha");
        }
        break;
      case "blur":
        setPose("ola");
        break;
      case "progress":
        setStep(event.step);
        say(event.step >= 1 ? "usuarioOk" : "usuario");
        break;
      case "password-visibility":
        setPasswordVisible(event.visible);
        setPose(event.visible ? "ola" : "olhos");
        say(event.visible ? "visivel" : "senha");
        break;
      case "submit-start":
        setStep(3);
        setPose("ola");
        say("checando");
        break;
      case "validation-error":
        setPose("duvida");
        say("erro");
        break;
      case "auth-failed":
        setStep(2);
        setPose("duvida");
        say("erro");
        break;
      case "submit-success":
        setStep(4);
        setWin(true);
        setPose("conquista");
        say("ok");
        break;
      case "stage":
        setPose("ola");
        say(event.stage === "verify" ? "verify" : event.stage === "enroll" ? "enroll" : "idle");
        break;
      case "forgot-view":
        setPose("ola");
        setStep(0);
        say(event.open ? "reset" : "idle");
        break;
    }
  }

  return (
    <div className={styles.scene}>
      <LegadoLogoMark litBars={step} win={win} playIntro className={styles.mark} />

      <div className={styles.stage}>
        <p className={`${styles.bubble} ${styles.mobileBubble} ${bubbleSwap ? styles.swap : ""}`} aria-live="polite">
          {bubbleText}
        </p>

        <div className={`${styles.who} ${styles.whoLeft}`}>
          <p className={`${styles.bubble} ${styles.desktopBubble} ${bubbleSwap ? styles.swap : ""}`} aria-live="polite">
            {bubbleText}
          </p>
          <Character side="titan" pose={pose} />
        </div>

        <div className={styles.slot}>
          <div className="w-full max-w-[380px] rounded-[18px] bg-white px-[26px] pt-[28px] pb-[22px] shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
            <LoginForm onVisualEvent={handleVisualEvent} />
          </div>
        </div>

        <div className={`${styles.who} ${styles.whoRight}`}>
          <Character side="legacy" pose={pose} />
        </div>

        <div className={styles.groundShadow} aria-hidden="true" />
      </div>
    </div>
  );
}
