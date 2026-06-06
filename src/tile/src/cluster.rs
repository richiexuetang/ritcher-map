//! Server-side clustering.
//!
//! At low zoom a viewport can contain thousands of markers; shipping them all
//! to the browser is slow and useless (they'd render on top of each other). We
//! collapse them into a grid of clusters *server-side* so the payload stays
//! small and roughly constant regardless of marker density.
//!
//! The grid cell is defined in **screen pixels** (`cell_px`) and converted into
//! map-pixel units using the zoom level. At the max zoom level one map pixel ==
//! one screen pixel; each zoom step down doubles the map-pixels-per-screen-pixel
//! ratio, so a fixed-size screen grid covers exponentially more map area as you
//! zoom out — which is exactly the behaviour you want.

use std::collections::HashMap;

use crate::domain::{Cluster, ClusterConfig, Marker};

/// Map-pixels per screen-pixel at `zoom`, given the pyramid's `max_zoom`.
///
/// At `zoom == max_zoom` the source is native (ratio 1.0). Each level below
/// doubles the ratio. We clamp the exponent at 0 so zoom levels above the
/// native max (over-zoom) don't shrink the grid below 1:1.
pub fn map_px_per_screen_px(zoom: i32, max_zoom: i32) -> f64 {
    let exp = (max_zoom - zoom).max(0);
    (1u64 << exp.min(62)) as f64
}

/// Collapse `markers` into clusters on a grid sized for `zoom`.
///
/// Single-marker cells are still returned as clusters with `count == 1`; the
/// caller decides whether to present them as clusters or expand them. A cluster
/// carries a `category_id` only when every marker in the cell shares one.
pub fn cluster_markers(
    markers: &[Marker],
    zoom: i32,
    max_zoom: i32,
    cfg: &ClusterConfig,
) -> Vec<Cluster> {
    if markers.is_empty() {
        return Vec::new();
    }
    let scale = map_px_per_screen_px(zoom, max_zoom);
    let cell = (cfg.cell_px * scale).max(1.0);

    struct Acc {
        sum_x: f64,
        sum_y: f64,
        count: i64,
        category: Option<i32>,
        mixed: bool,
    }

    let mut cells: HashMap<(i64, i64), Acc> = HashMap::new();
    for m in markers {
        let key = ((m.x / cell).floor() as i64, (m.y / cell).floor() as i64);
        let acc = cells.entry(key).or_insert(Acc {
            sum_x: 0.0,
            sum_y: 0.0,
            count: 0,
            category: Some(m.category_id),
            mixed: false,
        });
        acc.sum_x += m.x;
        acc.sum_y += m.y;
        acc.count += 1;
        if !acc.mixed && acc.category != Some(m.category_id) {
            acc.mixed = true;
            acc.category = None;
        }
    }

    let mut out: Vec<Cluster> = cells
        .into_values()
        .map(|a| Cluster {
            x: a.sum_x / a.count as f64,
            y: a.sum_y / a.count as f64,
            count: a.count,
            category_id: if a.mixed { None } else { a.category },
        })
        .collect();

    // Deterministic ordering (largest clusters first) so responses are stable
    // and easy to test; ties broken by position.
    out.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then(a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal))
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(id: i64, cat: i32, x: f64, y: f64) -> Marker {
        Marker {
            id,
            category_id: cat,
            x,
            y,
            title: None,
        }
    }

    #[test]
    fn scale_doubles_per_zoom_step_down() {
        assert_eq!(map_px_per_screen_px(5, 5), 1.0);
        assert_eq!(map_px_per_screen_px(4, 5), 2.0);
        assert_eq!(map_px_per_screen_px(3, 5), 4.0);
        // over-zoom is clamped to 1:1
        assert_eq!(map_px_per_screen_px(6, 5), 1.0);
    }

    #[test]
    fn empty_input_yields_no_clusters() {
        let cfg = ClusterConfig::default();
        assert!(cluster_markers(&[], 0, 5, &cfg).is_empty());
    }

    #[test]
    fn nearby_markers_merge_centroid_is_averaged() {
        let cfg = ClusterConfig {
            max_markers: 500,
            cell_px: 64.0,
            tile_size: 256.0,
        };
        // Two markers 10px apart at native zoom share a 64px cell.
        let markers = vec![m(1, 7, 100.0, 100.0), m(2, 7, 110.0, 100.0)];
        let clusters = cluster_markers(&markers, 5, 5, &cfg);
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].count, 2);
        assert_eq!(clusters[0].category_id, Some(7)); // homogeneous
        assert!((clusters[0].x - 105.0).abs() < 1e-9); // centroid
    }

    #[test]
    fn distant_markers_stay_separate() {
        let cfg = ClusterConfig {
            max_markers: 500,
            cell_px: 64.0,
            tile_size: 256.0,
        };
        // 1000px apart at native zoom -> different cells.
        let markers = vec![m(1, 7, 0.0, 0.0), m(2, 7, 1000.0, 1000.0)];
        let clusters = cluster_markers(&markers, 5, 5, &cfg);
        assert_eq!(clusters.len(), 2);
        assert!(clusters.iter().all(|c| c.count == 1));
    }

    #[test]
    fn zooming_out_merges_previously_separate_markers() {
        let cfg = ClusterConfig {
            max_markers: 500,
            cell_px: 64.0,
            tile_size: 256.0,
        };
        let markers = vec![m(1, 7, 0.0, 0.0), m(2, 7, 200.0, 0.0)];
        // At native zoom (cell=64px) they're separate.
        assert_eq!(cluster_markers(&markers, 5, 5, &cfg).len(), 2);
        // Zoomed out 3 levels (cell = 64 * 8 = 512px) they merge.
        assert_eq!(cluster_markers(&markers, 2, 5, &cfg).len(), 1);
    }

    #[test]
    fn mixed_categories_drop_category_id() {
        let cfg = ClusterConfig {
            max_markers: 500,
            cell_px: 64.0,
            tile_size: 256.0,
        };
        let markers = vec![m(1, 7, 100.0, 100.0), m(2, 9, 110.0, 100.0)];
        let clusters = cluster_markers(&markers, 5, 5, &cfg);
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].count, 2);
        assert_eq!(clusters[0].category_id, None); // heterogeneous
    }

    #[test]
    fn output_sorted_by_count_desc() {
        let cfg = ClusterConfig {
            max_markers: 500,
            cell_px: 64.0,
            tile_size: 256.0,
        };
        let mut markers = vec![m(1, 7, 0.0, 0.0)];
        // pile 3 into a far cell
        for i in 0..3 {
            markers.push(m(10 + i, 7, 5000.0 + i as f64, 5000.0));
        }
        let clusters = cluster_markers(&markers, 5, 5, &cfg);
        assert_eq!(clusters.len(), 2);
        assert!(clusters[0].count >= clusters[1].count);
        assert_eq!(clusters[0].count, 3);
    }
}
