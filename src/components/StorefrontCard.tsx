import { Camera, MapPin } from "lucide-react";
import { DirectionsFromHere } from "@/components/DirectionsFromHere";
import { placeUrl, shopLine, streetPhotoUrl } from "@/lib/map/storefrontLinks";
import type { StorefrontSign } from "@/lib/map/storefrontPick";
import type { PanelContent } from "@/lib/store/PanelContext";

const LINK = "inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The card a tapped shop opens at street level. Under its name sit the two
 * things people open it for (owner, 2026-11-10): the real photo of the shop
 * front and its Google Maps page (photos, hours, address). What kind of place
 * it is, the shops inside a mall, directions and the data credit wait until
 * the sheet is pulled up, so the card stays two short lines and the street
 * stays in view.
 */
export function storefrontPanel(shop: StorefrontSign): PanelContent {
  const shops = (shop.dir ?? "").split("|").filter(Boolean);
  return {
    id: `storefront:${shop.lng},${shop.lat}:${shop.name}`,
    title: shop.name,
    actions: (
      <>
        <a data-testid="shop-photo" className={LINK} href={streetPhotoUrl(shop)} target="_blank" rel="noopener noreferrer">
          <Camera className="h-3.5 w-3.5" aria-hidden />Photo
        </a>
        <a data-testid="shop-place" className={LINK} href={placeUrl(shop)} target="_blank" rel="noopener noreferrer">
          <MapPin className="h-3.5 w-3.5" aria-hidden />Google Maps
        </a>
      </>
    ),
    details: (
      <div className="space-y-2">
        {shopLine(shop) ? <p data-testid="shop-kind" className="text-sm text-muted-foreground">{shopLine(shop)}</p> : null}
        {shops.length ? <ul data-testid="shop-directory" className="space-y-1 text-sm">{shops.map((name) => <li key={name}>{name}</li>)}</ul> : null}
        <DirectionsFromHere lon={shop.lng} lat={shop.lat} label={shop.name} />
        <p className="text-[11px] text-muted-foreground">© OpenStreetMap contributors</p>
      </div>
    ),
  };
}
