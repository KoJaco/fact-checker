import type { Entity, EntityDeque, Memories } from "./types";

class SimpleEntityDeque implements EntityDeque {
    private items: Entity[] = [];
    private maxSize: number;

    constructor(maxSize: number = 20) {
        this.maxSize = maxSize;
    }

    push(e: Entity): void {
        // Remove if already exists (update)
        this.items = this.items.filter(
            (item) => item.canonical !== e.canonical
        );

        // Add to front
        this.items.unshift(e);

        // Trim to max size
        if (this.items.length > this.maxSize) {
            this.items = this.items.slice(0, this.maxSize);
        }
    }

    pop(): Entity | undefined {
        return this.items.shift();
    }

    peek(): Entity | undefined {
        return this.items[0];
    }

    toArray(): Entity[] {
        return [...this.items];
    }

    size(): number {
        return this.items.length;
    }
}

// Default alias map for common entity normalization
const DEFAULT_ALIASES = new Map<string, string>([
    ["us", "united states"],
    ["usa", "united states"],
    ["uk", "united kingdom"],
    ["unsw", "university of new south wales"],
    ["mit", "massachusetts institute of technology"],
    ["nasa", "national aeronautics and space administration"],
    ["fbi", "federal bureau of investigation"],
    ["cia", "central intelligence agency"],
    ["eu", "european union"],
    ["un", "united nations"],
    ["who", "world health organization"],
    ["nato", "north atlantic treaty organization"],
]);

// Regex patterns for entity extraction
const TITLE_NP =
    /\b(?:Dr|Prof|Professor|Minister|President|CEO|Chair|Senator)\.?\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;
const ORG_SUFFIX =
    /\b[A-Z][A-Za-z&.\-]{1,}\s+(?:Inc|Ltd|LLC|PLC|AG|GmbH|Corp|Co\.|University|Council|Ministry|Department)\b/g;
const PROPER_SEQ =
    /\b(?:[A-Z][a-z]+(?:\s|[-'])[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;
const ACRONYM = /\b[A-Z]{2,}(?:-[A-Z]{2,})?\b/g;
const DOMAIN =
    /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[\w\-./?%&=]*)?\b/i;

function canonicalizeEntity(surface: string): string {
    const raw = surface.trim();
    const lower = raw.toLowerCase();
    const isDomain = DOMAIN.test(raw);
    const base = DEFAULT_ALIASES.get(lower) || lower;
    const cleaned = isDomain ? base : base.replace(/[^\w\s-]/g, "");
    return cleaned.replace(/\s+/g, " ").trim();
}

function extractEntitiesFromText(text: string, sentenceIdx: number): Entity[] {
    const entities: Entity[] = [];
    const seen = new Set<string>();

    // Helper to add entity if not seen
    const addEntity = (surface: string, role?: Entity["role"]) => {
        const canonical = canonicalizeEntity(surface);
        if (!canonical || seen.has(canonical)) return;

        seen.add(canonical);

        // Simple salience scoring based on role and recency
        let salience = 0.5; // base
        if (role === "PERSON") salience += 0.3;
        else if (role === "ORG") salience += 0.2;
        else if (role === "PLACE") salience += 0.1;

        entities.push({
            surface,
            canonical,
            role,
            lastSeenSentenceIdx: sentenceIdx,
            salience,
            aliases: new Set([surface.toLowerCase()]),
        });
    };

    // Extract different types of entities
    const titleMatches = text.match(TITLE_NP) || [];
    titleMatches.forEach((match) => addEntity(match.trim(), "PERSON"));

    const orgMatches = text.match(ORG_SUFFIX) || [];
    orgMatches.forEach((match) => addEntity(match.trim(), "ORG"));

    const properMatches = text.match(PROPER_SEQ) || [];
    properMatches.forEach((match) => {
        // Skip if already captured by title or org patterns
        if (
            !titleMatches.some((t) => t.includes(match)) &&
            !orgMatches.some((o) => o.includes(match))
        ) {
            // Simple heuristic for role classification
            const role =
                match.includes(" ") && /[A-Z][a-z]+\s[A-Z][a-z]+/.test(match)
                    ? "PERSON"
                    : "OTHER";
            addEntity(match.trim(), role);
        }
    });

    const acronymMatches = text.match(ACRONYM) || [];
    acronymMatches.forEach((match) => {
        // Skip common words that are capitalized
        if (
            !["THE", "AND", "OR", "BUT", "FOR", "NOR", "SO", "YET"].includes(
                match
            )
        ) {
            addEntity(match.trim(), "ORG");
        }
    });

    // Capture domains/URLs as ORG anchors
    const domainMatches = text.match(DOMAIN) || [];
    domainMatches.forEach((match) => {
        addEntity(match.trim(), "ORG");
    });

    return entities;
}

export function updateMemoriesFromText(
    text: string,
    speakerTag: string | null | undefined,
    sentenceIdx: number,
    memories: Memories
): void {
    const entities = extractEntitiesFromText(text, sentenceIdx);

    entities.forEach((entity) => {
        // Update salience based on recency (decay older entities)
        entity.salience = Math.min(1.0, entity.salience + 0.1);

        // Add to global memory
        memories.globalMemory.push(entity);

        // Add to speaker-specific memory if speaker is known
        if (speakerTag) {
            if (!memories.speakerMemory.has(speakerTag)) {
                memories.speakerMemory.set(speakerTag, new SimpleEntityDeque());
            }
            memories.speakerMemory.get(speakerTag)!.push(entity);
        }
    });
}

export function createMemories(topicId: string = "default"): Memories {
    return {
        speakerMemory: new Map(),
        globalMemory: new SimpleEntityDeque(),
        topicId,
    };
}

export {
    SimpleEntityDeque,
    DEFAULT_ALIASES,
    TITLE_NP,
    ORG_SUFFIX,
    PROPER_SEQ,
    ACRONYM,
};
