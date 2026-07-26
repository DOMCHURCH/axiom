"""Generate the downloadable 'How Daddiesmoney finds your best trades' PDF.

Zero runtime dependency for the app — this is a build-time tool that emits a
static asset into frontend/public/. Run locally:

    backend/.venv/Scripts/python.exe backend/scripts/gen_flow_pdf.py

Output: frontend/public/how-it-works.pdf
"""

from __future__ import annotations

import os

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ------------------------------------------------------------------ palette
INK = HexColor("#1b151a")        # near-black warm
MUTED = HexColor("#6c6169")      # secondary text
FAINT = HexColor("#9a9098")      # tertiary
ACCENT = HexColor("#ef7a63")     # warm coral (matches the app)
ACCENT_SOFT = HexColor("#fbe6df")
LINE = HexColor("#e6ddd6")       # hairline
CARD = HexColor("#ffffff")
PAGE_BG = HexColor("#f6f1ec")    # warm off-white
UP = HexColor("#2f9e6f")
DOWN = HexColor("#d8664f")

PAGE_W, PAGE_H = LETTER
MARGIN = 0.72 * inch


# ------------------------------------------------------------------ styles
def _styles():
    s = {}
    s["kicker"] = ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=8.5,
                                 textColor=ACCENT, leading=12, spaceAfter=6,
                                 tracking=1.5)
    s["h1"] = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=27,
                             textColor=INK, leading=30, spaceAfter=8)
    s["sub"] = ParagraphStyle("sub", fontName="Helvetica", fontSize=11.5,
                              textColor=MUTED, leading=17, spaceAfter=4)
    s["h2"] = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=14.5,
                             textColor=INK, leading=18, spaceBefore=6, spaceAfter=8)
    s["body"] = ParagraphStyle("body", fontName="Helvetica", fontSize=10.2,
                               textColor=HexColor("#3a333a"), leading=15.5,
                               spaceAfter=8, alignment=TA_LEFT)
    s["small"] = ParagraphStyle("small", fontName="Helvetica", fontSize=8.6,
                                textColor=FAINT, leading=12)
    s["cell_h"] = ParagraphStyle("cell_h", fontName="Helvetica-Bold", fontSize=9.6,
                                 textColor=INK, leading=13)
    s["cell"] = ParagraphStyle("cell", fontName="Helvetica", fontSize=9.4,
                               textColor=HexColor("#3a333a"), leading=13)
    s["cell_accent"] = ParagraphStyle("cell_accent", fontName="Helvetica-Bold",
                                      fontSize=9.6, textColor=ACCENT, leading=13)
    return s


ST = _styles()


# ------------------------------------------------------------------ funnel flowable
class Funnel(Flowable):
    """A vertical numbered flow of pipeline stages with connectors + a shrinking
    'count' rail on the right."""

    def __init__(self, stages, width):
        super().__init__()
        self.stages = stages
        self.width = width
        self.row_h = 46
        self.gap = 12
        self.height = len(stages) * self.row_h + (len(stages) - 1) * self.gap

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        n = len(self.stages)
        num_w = 34
        rail_w = 88
        card_x = num_w + 10
        card_w = self.width - card_x - rail_w - 8
        top = self.height

        for i, stage in enumerate(self.stages):
            title, desc, count = stage[0], stage[1], stage[2]
            count_label = stage[3] if len(stage) > 3 else ""
            y = top - i * (self.row_h + self.gap) - self.row_h
            cy = y + self.row_h / 2

            # connector line to next
            if i < n - 1:
                c.setStrokeColor(LINE)
                c.setLineWidth(1.4)
                c.line(num_w / 2, y - 1, num_w / 2, y - self.gap + 1)
                # arrowhead
                c.setFillColor(LINE)
                ax = num_w / 2
                ay = y - self.gap + 1
                c.setStrokeColor(LINE)
                c.line(ax - 2.4, ay + 3.2, ax, ay)
                c.line(ax + 2.4, ay + 3.2, ax, ay)

            # number disc
            c.setFillColor(INK)
            c.circle(num_w / 2, cy, num_w / 2, stroke=0, fill=1)
            c.setFillColor(CARD)
            c.setFont("Helvetica-Bold", 13)
            c.drawCentredString(num_w / 2, cy - 4.6, str(i + 1))

            # card
            c.setFillColor(CARD)
            c.setStrokeColor(LINE)
            c.setLineWidth(1)
            c.roundRect(card_x, y, card_w, self.row_h, 7, stroke=1, fill=1)
            # accent tab
            c.setFillColor(ACCENT)
            c.roundRect(card_x, y, 3.5, self.row_h, 1.6, stroke=0, fill=1)

            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 10.6)
            c.drawString(card_x + 14, cy + 2.2, title)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 8.4)
            c.drawString(card_x + 14, cy - 9.2, desc)

            # count rail
            if count:
                c.setFillColor(ACCENT)
                c.setFont("Helvetica-Bold", 12.5)
                c.drawRightString(self.width, cy + 2.4, count)
                c.setFillColor(FAINT)
                c.setFont("Helvetica", 6.6)
                c.drawRightString(self.width, cy - 7.5, count_label.upper())


# ------------------------------------------------------------------ small helpers
class Rule(Flowable):
    def __init__(self, width, color=LINE, thickness=1, pad=0):
        super().__init__()
        self.width, self.color, self.thickness, self.pad = width, color, thickness, pad
        self.height = thickness + pad

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.pad, self.width, self.pad)


class StatStrip(Flowable):
    """Four headline stats across the cover page."""

    def __init__(self, stats, width):
        super().__init__()
        self.stats = stats
        self.width = width
        self.height = 78

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        n = len(self.stats)
        gap = 12
        cw = (self.width - gap * (n - 1)) / n
        for i, (big, label) in enumerate(self.stats):
            x = i * (cw + gap)
            c.setFillColor(CARD)
            c.setStrokeColor(LINE)
            c.setLineWidth(1)
            c.roundRect(x, 0, cw, self.height, 9, stroke=1, fill=1)
            c.setFillColor(ACCENT)
            c.roundRect(x, self.height - 4, cw, 4, 2, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 22)
            c.drawCentredString(x + cw / 2, self.height / 2 + 2, big)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 8.2)
            c.drawCentredString(x + cw / 2, 13, label)


class Chips(Flowable):
    """Flowing 'chip' badges — used for the strategy list."""

    def __init__(self, items, width):
        super().__init__()
        self.items = items
        self.width = width
        self.fs = 8.6
        self.pad_x = 8
        self.h = 17
        self.vg = 7
        self.rows = self._layout()
        self.height = len(self.rows) * (self.h + self.vg) - self.vg

    def _tw(self, t):
        from reportlab.pdfbase.pdfmetrics import stringWidth
        return stringWidth(t, "Helvetica-Bold", self.fs)

    def _layout(self):
        rows, cur, x = [], [], 0.0
        for it in self.items:
            w = self._tw(it) + self.pad_x * 2
            if x + w > self.width and cur:
                rows.append(cur)
                cur, x = [], 0.0
            cur.append((it, w))
            x += w + 6
        if cur:
            rows.append(cur)
        return rows

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        top = self.height
        for r, row in enumerate(self.rows):
            y = top - (r + 1) * self.h - r * self.vg
            x = 0.0
            for label, w in row:
                c.setFillColor(ACCENT_SOFT)
                c.setStrokeColor(HexColor("#f3d3c8"))
                c.setLineWidth(0.8)
                c.roundRect(x, y, w, self.h, self.h / 2, stroke=1, fill=1)
                c.setFillColor(HexColor("#b0503c"))
                c.setFont("Helvetica-Bold", self.fs)
                c.drawCentredString(x + w / 2, y + 4.8, label)
                x += w + 6


# ------------------------------------------------------------------ page chrome
def _bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # top hairline accent
    canvas.setFillColor(ACCENT)
    canvas.rect(0, PAGE_H - 6, PAGE_W, 6, stroke=0, fill=1)
    # footer
    canvas.setFillColor(FAINT)
    canvas.setFont("Helvetica", 7.6)
    canvas.drawString(MARGIN, 0.42 * inch,
                      "Daddiesmoney  ·  Educational research tool — not financial advice")
    canvas.drawRightString(PAGE_W - MARGIN, 0.42 * inch, f"{doc.page}")
    canvas.restoreState()


def _table(data, col_widths, header=True):
    t = Table(data, colWidths=col_widths, hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -2), 0.6, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), CARD),
        ("BOX", (0, 0), (-1, -1), 1, LINE),
        ("ROUNDEDCORNERS", [7, 7, 7, 7]),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#efe7df")),
            ("LINEBELOW", (0, 0), (-1, 0), 1, LINE),
        ]
    t.setStyle(TableStyle(style))
    return t


def build(path):
    doc = BaseDocTemplate(
        path, pagesize=LETTER,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        title="How Daddiesmoney Finds Your Best Trades",
        author="Daddiesmoney",
    )
    frame = Frame(MARGIN, 0.7 * inch, PAGE_W - 2 * MARGIN, PAGE_H - 1.4 * inch,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=_bg)])
    cw = PAGE_W - 2 * MARGIN

    E = []

    # ---- cover / intro ----
    E.append(Paragraph("THE PROCESS, END TO END", ST["kicker"]))
    E.append(Paragraph("How Daddiesmoney finds your best trades", ST["h1"]))
    E.append(Spacer(1, 4))
    E.append(Paragraph(
        "Every time you press <b>Find Best Trades</b>, the platform runs the same funnel. "
        "It starts wide — thousands of liquid US stocks — and narrows to a short list of "
        "sized, ready-to-place trades. The trick is <i>where the effort goes</i>: fast, cheap "
        "math runs on everything; the slow, expensive work (news, fundamentals, and the AI "
        "thesis) is spent only on the few names that survive. Here is exactly what happens, "
        "in order.", ST["body"]))
    E.append(Spacer(1, 10))
    E.append(StatStrip([
        ("~6,000+", "liquid stocks scanned"),
        ("14", "trading strategies"),
        ("8", "scoring factors"),
        ("~6", "sized positions"),
    ], cw))
    E.append(Spacer(1, 16))
    E.append(Rule(cw, LINE, 1, 0))
    E.append(Spacer(1, 12))
    E.append(Paragraph(
        "<b>Inside this guide:</b>&nbsp; the funnel, step by step&nbsp; ·&nbsp; what each stage is "
        "doing&nbsp; ·&nbsp; the 8 factors behind every score&nbsp; ·&nbsp; the 14 strategies&nbsp; ·&nbsp; "
        "how your capital is sized&nbsp; ·&nbsp; the two ways every pick is explained.", ST["body"]))

    E.append(PageBreak())

    # ---- the funnel ----
    E.append(Paragraph("THE FUNNEL, STEP BY STEP", ST["kicker"]))
    E.append(Paragraph("From the whole market to a handful of trades", ST["h2"]))
    stages = [
        ("Liquid universe", "The tradeable US watchlist we track and have seeded in the database.", "~6,000+", "stocks"),
        ("Daily prices (Yahoo)", "1 year of daily bars, one bulk request, cached 4h.", "", ""),
        ("Technicals + liquidity gate", "RSI, MACD, MAs, ATR — then drop thin / low-priced names.", "hundreds", "after gate"),
        ("Strategy signals", "14 trading strategies score each survivor 0–100.", "", ""),
        ("Trade score", "8 factors blended, weighted to your horizon, regime-filtered.", "", ""),
        ("Rank & shortlist", "Sort by score, keep the strongest ~15.", "~15", "shortlist"),
        ("Enrich the finalists", "News sentiment (+ optional fundamentals) on the sizable names, then re-score.", "~8", "finalists"),
        ("Build setups", "Entry zone, stop, two targets, pivots, holding days, reward-to-risk.", "", ""),
        ("Size the positions", "Risk-based allocation with per-name, sector & liquidity caps.", "~6", "positions"),
        ("Your trade desk", "Each trade with a plain-English 'Why', plus an on-demand AI thesis.", "", ""),
    ]
    E.append(Funnel(stages, cw))
    E.append(Spacer(1, 6))
    E.append(Paragraph(
        "The count on the right shows the field narrowing — from every liquid stock down to "
        "roughly six positions your capital actually gets spread across. Cheap math runs on the "
        "whole list; the expensive steps touch only the finalists.", ST["small"]))

    E.append(PageBreak())

    # ---- stage detail ----
    E.append(Paragraph("WHAT EACH STAGE IS DOING", ST["kicker"]))
    E.append(Paragraph("Inside the pipeline", ST["h2"]))

    detail = [
        ("1 · Liquid universe",
         "The scan only considers stocks that are liquid enough to actually trade and that we "
         "already track. Illiquid, penny, and untracked tickers never enter — you can’t get a "
         "clean fill in them, so they’re not worth scoring."),
        ("2 · Daily prices",
         "One year of daily candles is pulled for the whole universe in a single bulk call, using "
         "a browser-impersonated client so datacenter IPs aren’t blocked. Results are cached for "
         "four hours, so re-running a scan the same afternoon is near-instant."),
        ("3 · Technicals + liquidity gate",
         "For every name we compute the core indicators — RSI, MACD, moving averages (20/50/200), "
         "ATR, realized volatility, drawdown. Then a hard gate removes anything under your minimum "
         "price or average dollar-volume. This is the first big cut."),
        ("4 · Strategy signals",
         "Each survivor is run through 14 independent trading strategies. Every strategy returns a "
         "0–100 score, so a stock can look strong on momentum but weak on mean-reversion — the "
         "engine keeps all of them rather than forcing one view."),
        ("5 · Trade score",
         "The strategy signals collapse into 8 factor sub-scores, blended into a single 0–100 "
         "Overall Trade Score. The blend is weighted to your holding period, then a regime filter "
         "(Elder’s triple-screen idea) nudges with-trend longs up and fighting-the-trend longs down."),
        ("6 · Rank & shortlist",
         "Everything is sorted by Overall Trade Score and the top ~15 are kept. The long tail keeps "
         "its price/technical score but goes no further — no reason to spend API calls on it."),
        ("7 · Enrich the finalists",
         "Only the handful of names that could realistically be sized get the expensive treatment: "
         "live news-tone (sentiment) and, optionally, fundamentals. These calls run in parallel so "
         "one slow response can’t stall the scan, and every finalist is then re-scored with the new "
         "information."),
        ("8 · Build setups",
         "For each finalist the engine derives an actual trade plan: an entry zone, a stop-loss under "
         "support, two profit targets near resistance, pivot levels, an expected holding window, and "
         "the resulting reward-to-risk."),
        ("9 · Size the positions",
         "Capital is split — never all-in on one name. Higher-confidence, lower-volatility, less-"
         "correlated trades get more; then weights are capped per name (35%), per sector (45%), and "
         "by liquidity, and rounded to whole shares."),
        ("10 · Your trade desk",
         "The finished trades land on your dashboard. Each carries an instant plain-English “Why this "
         "trade,” and you can generate a deeper AI thesis (GLM-5.2) on demand for any one of them."),
    ]
    rows = [[Paragraph(t, ST["cell_h"]), Paragraph(d, ST["cell"])] for t, d in detail]
    E.append(_table(rows, [1.72 * inch, cw - 1.72 * inch], header=False))

    E.append(PageBreak())

    # ---- the 8 factors ----
    E.append(Paragraph("HOW A STOCK EARNS ITS SCORE", ST["kicker"]))
    E.append(Paragraph("The 8 factors behind every trade score", ST["h2"]))
    E.append(Paragraph(
        "The Overall Trade Score isn’t a black box — it’s a weighted blend of these eight factors, "
        "each on a 0–100 scale.", ST["body"]))
    fac = [
        [Paragraph("Factor", ST["cell_h"]), Paragraph("What it measures", ST["cell_h"])],
        [Paragraph("Momentum", ST["cell_accent"]),
         Paragraph("Speed and persistence of the up-move, including relative strength vs. the market "
                   "and risk-adjusted momentum.", ST["cell"])],
        [Paragraph("Breakout", ST["cell_accent"]),
         Paragraph("Pushing through the recent range and prior resistance.", ST["cell"])],
        [Paragraph("Trend", ST["cell_accent"]),
         Paragraph("Alignment of moving averages and the quality of pullbacks within the trend.", ST["cell"])],
        [Paragraph("Volume", ST["cell_accent"]),
         Paragraph("Participation — volume-backed breakouts and gap strength.", ST["cell"])],
        [Paragraph("Volatility", ST["cell_accent"]),
         Paragraph("Expansion out of quiet, coiled ranges (measured with ATR).", ST["cell"])],
        [Paragraph("Fundamental", ST["cell_accent"]),
         Paragraph("Quality and valuation — only when enrichment is on, and low-weight for short "
                   "horizons.", ST["cell"])],
        [Paragraph("Sentiment", ST["cell_accent"]),
         Paragraph("News tone (GDELT) and news momentum around the name.", ST["cell"])],
        [Paragraph("Risk", ST["cell_accent"]),
         Paragraph("Safety score — tighter ATR, shallower drawdown and deeper liquidity all score "
                   "higher (higher = safer).", ST["cell"])],
    ]
    E.append(_table(fac, [1.5 * inch, cw - 1.5 * inch], header=True))
    E.append(Spacer(1, 14))

    E.append(Paragraph("Weighted to your time frame", ST["h2"]))
    E.append(Paragraph(
        "The same eight factors matter differently depending on how long you plan to hold. A day "
        "trade leans on <b>volume, breakout and volatility</b>; a one-month swing leans on <b>trend "
        "and fundamentals</b>. Pick a horizon and the weights shift automatically.", ST["body"]))
    E.append(Spacer(1, 4))
    hz = [
        [Paragraph("Horizon", ST["cell_h"]), Paragraph("Leans hardest on", ST["cell_h"])],
        [Paragraph("Intraday", ST["cell_accent"]), Paragraph("Volume · Breakout · Volatility", ST["cell"])],
        [Paragraph("1–3 days", ST["cell_accent"]), Paragraph("Momentum · Breakout · Volume", ST["cell"])],
        [Paragraph("1 week", ST["cell_accent"]), Paragraph("Momentum · Breakout · Trend", ST["cell"])],
        [Paragraph("2 weeks", ST["cell_accent"]), Paragraph("Momentum · Trend · Fundamental", ST["cell"])],
        [Paragraph("1 month", ST["cell_accent"]), Paragraph("Trend · Fundamental · Momentum", ST["cell"])],
    ]
    E.append(_table(hz, [1.5 * inch, cw - 1.5 * inch], header=True))

    E.append(PageBreak())

    # ---- strategies ----
    E.append(Paragraph("THE PLAYBOOK", ST["kicker"]))
    E.append(Paragraph("14 strategies scored on every name", ST["h2"]))
    E.append(Paragraph(
        "Rather than betting on one definition of a “good setup,” the engine scores each stock "
        "against all of these at once. The strongest individual signal becomes the trade’s named "
        "strategy on your dashboard.", ST["body"]))
    E.append(Spacer(1, 4))
    E.append(Chips([
        "Momentum", "Breakout", "Trend Following", "Pullback Entry", "Mean Reversion",
        "Gap Trade", "High-Volume Breakout", "MA Crossover", "Volatility Expansion",
        "S/R Break", "Relative Strength", "Earnings Momentum", "News Momentum", "Sector Rotation",
    ], cw))
    E.append(Spacer(1, 20))

    # ---- allocation ----
    E.append(Paragraph("PROTECTING THE DOWNSIDE", ST["kicker"]))
    E.append(Paragraph("How your capital is sized", ST["h2"]))
    E.append(Paragraph(
        "Finding a good trade is only half the job — sizing it is the other half. Allocation follows "
        "a few firm rules so no single idea can sink the book:", ST["body"]))
    alloc = [
        ("Confidence-weighted", "More capital flows to higher-confidence trades, less to marginal ones."),
        ("Volatility parity", "Weights tilt inverse to risk, using each trade’s actual stop distance so "
                              "tighter-stop setups earn more capital at comparable dollar risk."),
        ("Correlation penalty", "Names that move together get trimmed, so you’re not accidentally making "
                                "the same bet five times."),
        ("Hard caps", "No more than 35% in one name, 45% in one sector, and no position larger than a "
                      "slice of the stock’s daily liquidity."),
        ("Whole shares", "Final weights convert to real, whole-share positions with the leftover held as cash."),
    ]
    arows = [[Paragraph(t, ST["cell_accent"]), Paragraph(d, ST["cell"])] for t, d in alloc]
    E.append(_table(arows, [1.6 * inch, cw - 1.6 * inch], header=False))
    E.append(Spacer(1, 16))

    # ---- two explanations ----
    E.append(Paragraph("WHY YOU CAN TRUST THE PICK", ST["kicker"]))
    E.append(Paragraph("Two kinds of explanation", ST["h2"]))
    two = [
        [Paragraph("“Why this trade”", ST["cell_h"]), Paragraph("AI trade thesis (GLM-5.2)", ST["cell_h"])],
        [Paragraph("Instant and free. A deterministic, plain-English readout built straight from the "
                   "numbers — which setup it is, the factors that agree, the entry/stop/target logic, "
                   "and how it was sized. Shown on every trade automatically.", ST["cell"]),
         Paragraph("On demand. A reasoning model reads the same setup and writes a deeper narrative — "
                   "the thesis, technical and fundamental context, news, and the key risks. Uses metered "
                   "tokens, so it runs only when you ask for it.", ST["cell"])],
    ]
    E.append(_table(two, [(cw) / 2, (cw) / 2], header=True))
    E.append(Spacer(1, 14))
    E.append(Paragraph(
        "Together they mean nothing on your desk is a mystery: the fast layer always tells you the "
        "“why,” and the AI layer is there when you want the long read.", ST["body"]))

    doc.build(E)
    return path


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.normpath(os.path.join(here, "..", "..", "frontend", "public", "how-it-works.pdf"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    build(out)
    print("wrote", out, os.path.getsize(out), "bytes")
