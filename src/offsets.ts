export interface Offsets {
    toIndex(byteOffset: number): number;
    toByteOffset(index: number): number;
}

export function offsets(text: string): Offsets {
    const starts = new Uint32Array(text.length + 1);
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        starts[i] = bytes;
        const unit = text.charCodeAt(i);
        if (unit < 0x80) {
            bytes += 1;
        } else if (unit < 0x800) {
            bytes += 2;
        } else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
            i += 1;
            starts[i] = bytes;
            bytes += 4;
        } else {
            bytes += 3;
        }
    }
    starts[text.length] = bytes;

    return {
        toIndex(byteOffset) {
            let low = 0;
            let high = text.length;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (starts[mid] < byteOffset) {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            }
            return low;
        },
        toByteOffset(index) {
            return starts[Math.max(0, Math.min(index, text.length))];
        },
    };
}

export function byteOffsetToIndex(text: string): (byteOffset: number) => number {
    return offsets(text).toIndex;
}
