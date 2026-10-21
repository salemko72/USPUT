import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getOwnPhotos, subscribeToOwnAvatarChanges } from "./photo-client";
import type { PhotoMeta } from "./photo-client";

type OwnerPhoto = { userId: string | null; avatar: PhotoMeta | null };
const AvatarPhotoContext = createContext<OwnerPhoto>({
  userId: null,
  avatar: null,
});

export function CurrentUserPhotoProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [photo, setPhoto] = useState<OwnerPhoto | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let latestRequest = 0;

    async function refresh() {
      const request = ++latestRequest;
      try {
        const own = await getOwnPhotos(false);
        if (active && request === latestRequest)
          setPhoto({ userId, avatar: own.avatar });
      } catch {
        if (active && request === latestRequest)
          setPhoto({ userId, avatar: null });
      }
    }

    const unsubscribe = subscribeToOwnAvatarChanges(() => {
      setPhoto({ userId, avatar: null });
      void refresh();
    });
    void refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  // Hide the departed owner's photo during render, before effect cleanup runs.
  const avatar = photo?.userId === userId ? photo.avatar : null;
  return (
    <AvatarPhotoContext.Provider value={{ userId, avatar }}>
      {children}
    </AvatarPhotoContext.Provider>
  );
}

export function useCurrentUserPhoto(userId?: string): PhotoMeta | null {
  const current = useContext(AvatarPhotoContext);
  return userId && userId === current.userId ? current.avatar : null;
}
