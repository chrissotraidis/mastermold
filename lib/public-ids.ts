const ALERT_ID_PREFIX = "alert_";

export function publicAlertId(rawId: string) {
  return `${ALERT_ID_PREFIX}${Buffer.from(rawId, "utf8").toString("base64url")}`;
}

export function rawAlertIdFromPublic(id: string) {
  const decodedId = safelyDecodeURIComponent(id);
  if (!decodedId.startsWith(ALERT_ID_PREFIX)) {
    return decodedId;
  }

  try {
    return Buffer.from(decodedId.slice(ALERT_ID_PREFIX.length), "base64url").toString("utf8");
  } catch {
    return decodedId;
  }
}

function safelyDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
