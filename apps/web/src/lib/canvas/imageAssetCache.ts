import { scene } from "@/lib/scene/scene";
import { loadImageAsset } from "@/lib/persistence/imageFiles";

export function createImageAssetCache(
  imageAssets: Map<string, ImageBitmap>,
  invalidate: () => void,
) {
  let disposed = false;
  const loadingImageIds = new Set<string>();
  const sync = () => {
    const imageIds = new Set(
      scene
        .getElements()
        .flatMap((element) =>
          element.type === "image" && !element.isDeleted
            ? [element.fileId]
            : [],
        ),
    );
    for (const [id, bitmap] of imageAssets) {
      if (!imageIds.has(id)) {
        bitmap.close();
        imageAssets.delete(id);
      }
    }
    for (const id of imageIds) {
      if (imageAssets.has(id) || loadingImageIds.has(id)) continue;
      loadingImageIds.add(id);
      void loadImageAsset(id)
        .then((bitmap) => {
          loadingImageIds.delete(id);
          const stillNeeded = scene
            .getElements()
            .some(
              (element) =>
                element.type === "image" &&
                element.fileId === id &&
                !element.isDeleted,
            );
          if (!bitmap) {
            console.error(`Could not find stored image ${id}`);
            return;
          }
          if (disposed || !stillNeeded) {
            bitmap.close();
            return;
          }
          imageAssets.set(id, bitmap);
          invalidate();
        })
        .catch((error: unknown) => {
          loadingImageIds.delete(id);
          console.error("Could not load an image from local storage", error);
        });
    }
  };

  return {
    sync,
    dispose: () => {
      disposed = true;
      for (const bitmap of imageAssets.values()) bitmap.close();
      imageAssets.clear();
    },
  };
}
