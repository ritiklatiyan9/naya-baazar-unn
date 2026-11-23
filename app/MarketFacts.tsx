import { Icon } from "./icons";

export function MarketFacts({shopCount}: {shopCount: number}) {
  return <section className="market-facts" aria-label="Project at a glance">
    <div className="facts-inner">
      <div><Icon name="shops"/><p><strong>{shopCount}</strong><span>Retail shops</span></p></div>
      <div><Icon name="plan"/><p><strong>Two levels</strong><span>Ground &amp; first floors</span></p></div>
      <div><Icon name="leaf"/><p><strong>Open-air</strong><span>Landscaped courtyard</span></p></div>
    </div>
  </section>;
}
