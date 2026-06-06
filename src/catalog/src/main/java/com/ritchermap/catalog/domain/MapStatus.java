package com.ritchermap.catalog.domain;

/**
 * Lifecycle of a map row in the catalog.
 *
 * <pre>
 *   DRAFT     -> editor created the row, no source image yet
 *   UPLOADED  -> source image stored; tiling job requested
 *   TILING    -> worker is processing (optional state)
 *   READY     -> tiles exist and width/height/max_zoom are populated; readable
 *   FAILED    -> tiling failed; surfaced to the editor
 * </pre>
 *
 * Only {@link #READY} maps are visible to the read path.
 */
public enum MapStatus {
    DRAFT,
    UPLOADED,
    TILING,
    READY,
    FAILED
}
