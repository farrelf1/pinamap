// utils/convertToGeoJSON.ts
export function convertToGeoJSON(data: any[]) {
    return {
      type: 'FeatureCollection',
      features: data.map((item) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [item.longitude, item.latitude],
        },
        properties: {
          id: item.id,
          message: item.message,
          receiver: item.receiver,
          time: item.time,
        },
      })),
    };
  }
  