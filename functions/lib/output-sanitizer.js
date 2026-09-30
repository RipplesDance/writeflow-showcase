/* 模块说明：从生产代码整理出的流式推理内容过滤器，防止跨 chunk 的 <think> 内容出现在正文。 */
const OPEN_THINK_TAG = "<think>";
const CLOSE_THINK_TAG = "</think>";

function findPendingMarkerLength(value, markers) {
  const text = String(value || "");
  for (let length = Math.min(text.length, CLOSE_THINK_TAG.length - 1); length > 0; length -= 1) {
    const suffix = text.slice(-length);
    if (markers.some((marker) => marker.startsWith(suffix))) return length;
  }
  return 0;
}

function findNextMarker(value, markers) {
  let match = null;
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index === -1 || (match && index >= match.index)) continue;
    match = { index, marker };
  }
  return match;
}

/* 保留尚未收全的标签前缀，直到能确定它属于正文或推理块。 */
export function createReasoningTextFilter() {
  let buffer = "";
  let insideThinkBlock = false;

  function drain(flush) {
    let visible = "";

    while (buffer) {
      const markers = insideThinkBlock
        ? [CLOSE_THINK_TAG]
        : [OPEN_THINK_TAG, CLOSE_THINK_TAG];
      const nextMarker = findNextMarker(buffer, markers);

      if (nextMarker) {
        if (!insideThinkBlock) {
          visible += buffer.slice(0, nextMarker.index);
        }
        buffer = buffer.slice(nextMarker.index + nextMarker.marker.length);
        insideThinkBlock = nextMarker.marker === OPEN_THINK_TAG;
        continue;
      }

      const pendingLength = findPendingMarkerLength(buffer, markers);
      const readyLength = buffer.length - pendingLength;
      if (!insideThinkBlock && readyLength > 0) {
        visible += buffer.slice(0, readyLength);
      }
      buffer = buffer.slice(readyLength);
      break;
    }

    if (flush) {
      buffer = "";
      insideThinkBlock = false;
    }

    return visible;
  }

  return {
    push(chunk) {
      buffer += String(chunk || "");
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}

export function stripReasoningArtifacts(value) {
  const filter = createReasoningTextFilter();
  return `${filter.push(value)}${filter.flush()}`;
}
