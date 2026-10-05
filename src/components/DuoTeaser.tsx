import Link from "next/link";
import { ROUTES } from "@/lib/site-config";

export default function DuoTeaser() {
  return (
    <section className="lg-teaser lg-dark" data-score="2">
      <div className="lg-in">
        <div className="lg-txt">
          <span className="lg-eyebrow">A dupla da Legado</span>
          <h2 className="lg-h2">Titan &amp; Legacy</h2>
          <p className="lg-lead">
            Dois lobos, uma alcateia. Eles carregam o jeito Legado de jogar: estratégia e
            execução lado a lado, do primeiro saque ao match point.
          </p>
          <div className="lg-btns">
            <Link href={ROUTES.duo} className="lg-btn lg-btn-metal">
              Conhecer a dupla
            </Link>
          </div>
        </div>
        <div className="lg-pair">
          <img
            src="/site/home/dupla-titan-capitao.webp"
            alt="Titan com a raquete no ombro"
            loading="lazy"
          />
          <img
            src="/site/home/dupla-legacy-capitao.webp"
            alt="Legacy com a raquete no ombro"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
