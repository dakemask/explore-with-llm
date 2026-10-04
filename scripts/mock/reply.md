## 二分查找

二分查找的时间复杂度是 $O(\log n)$，也可以写成 \(O(\log n)\)。核心思路：

1. 维护区间 `[lo, hi]`
2. 每次比较中点，**缩小一半**

```python
def bsearch(a, x):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == x:
            return mid
        lo, hi = (mid + 1, hi) if a[mid] < x else (lo, mid - 1)
    return -1
```

| 算法 | 复杂度 |
|---|---|
| 线性查找 | $O(n)$ |
| 二分查找 | $O(\log n)$ |

递推式：

\[ T(n) = T(n/2) + O(1) \]
