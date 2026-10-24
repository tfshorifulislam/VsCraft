import React from "react";
import Image from "next/image";
import { resolveFileIcon } from "@/lib/icons/materialIcons";

interface MaterialFileIconProps {
  name: string;
  path?: string;
  isFolder?: boolean;
  isExpanded?: boolean;
  size?: number;
  className?: string;
}

function MaterialFileIcon({
  name,
  path = "",
  isFolder = false,
  isExpanded = false,
  size = 16,
  className,
}: MaterialFileIconProps) {
  const { src } = resolveFileIcon(name, path, isFolder, isExpanded);

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      unoptimized
      draggable={false}
      aria-hidden="true"
      className={["shrink-0 object-contain select-none", className].filter(Boolean).join(" ")}
    />
  );
}

export default React.memo(MaterialFileIcon);
