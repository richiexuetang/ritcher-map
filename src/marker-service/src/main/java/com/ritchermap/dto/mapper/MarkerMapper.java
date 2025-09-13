package com.ritchermap.dto.mapper;

import com.ritchermap.dto.request.CreateMarkerRequest;
import com.ritchermap.dto.request.UpdateMarkerRequest;
import com.ritchermap.dto.response.*;
import com.ritchermap.entity.Marker;
import com.ritchermap.entity.MarkerCategory;
import com.ritchermap.entity.MarkerHistory;
import com.ritchermap.entity.MarkerTag;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.mapstruct.*;

@Mapper(componentModel = "spring", nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface MarkerMapper {

    GeometryFactory GEOMETRY_FACTORY = new GeometryFactory();

//    @Mapping(target = "id", ignore = true)
//    @Mapping(target = "createdAt", ignore = true)
//    @Mapping(target = "updatedAt", ignore = true)
//    @Mapping(target = "coordinates", source = ".", qualifiedByName = "createPoint")
//    @Mapping(target = "category", ignore = true)
//    @Mapping(target = "tags", ignore = true)
//    @Mapping(target = "status", constant = "ACTIVE")
//    @Mapping(target = "verified", constant = "false")
//    @Mapping(target = "viewCount", constant = "0")
//    @Mapping(target = "likeCount", constant = "0")
//    @Mapping(target = "history", ignore = true)
//    @Mapping(target = "comments", ignore = true)
    Marker toEntity(CreateMarkerRequest request);

//    @Mapping(target = "id", ignore = true)
//    @Mapping(target = "gameId", ignore = true)
//    @Mapping(target = "mapId", ignore = true)
//    @Mapping(target = "createdAt", ignore = true)
//    @Mapping(target = "updatedAt", ignore = true)
//    @Mapping(target = "coordinates", source = ".", qualifiedByName = "updatePoint")
//    @Mapping(target = "category", ignore = true)
//    @Mapping(target = "tags", ignore = true)
//    @Mapping(target = "createdBy", ignore = true)
//    @Mapping(target = "history", ignore = true)
//    @Mapping(target = "comments", ignore = true)
    void updateEntity(@MappingTarget Marker marker, UpdateMarkerRequest request);

    MarkerResponse toResponse(Marker marker);

    MarkerSummaryResponse toSummaryResponse(Marker marker);

    MarkerCategoryResponse toCategoryResponse(MarkerCategory category);

    MarkerTagResponse toTagResponse(MarkerTag tag);

    MarkerHistoryResponse toHistoryResponse(MarkerHistory history);

    @Named("createPoint")
    default Point createPoint(CreateMarkerRequest request) {
        if (request.getLatitude() == null || request.getLongitude() == null) {
            return null;
        }
        return GEOMETRY_FACTORY.createPoint(new Coordinate(
                request.getLongitude().doubleValue(),
                request.getLatitude().doubleValue()
        ));
    }

    @Named("updatePoint")
    default Point updatePoint(UpdateMarkerRequest request) {
        if (request.getLatitude() == null || request.getLongitude() == null) {
            return null;
        }
        return GEOMETRY_FACTORY.createPoint(new Coordinate(
                request.getLongitude().doubleValue(),
                request.getLatitude().doubleValue()
        ));
    }
}