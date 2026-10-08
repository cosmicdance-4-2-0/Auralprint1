| Scenario | H.S | H.T | H.U | H.V | H.W |
| --- | ---: | ---: | ---: | ---: | ---: |
| default-two | 2.560* | 1.270 | 1.365 | 1.060 | 1.560 |
| stationary-sixteen | 13.175* | 1.085 | 1.090 | 0.925 | 0.970 |
| moving-sixteen | 12.425* | 4.695 | 4.425 | 4.660 | 4.515 |
| dense-sixteen | 13.670 | 15.870 | 11.510 | 16.445 | 12.895 |
| expert-sixteen | 20.330* | 13.350* | 179.590 | 175.605 | 182.125 |
| saturated-sixteen | 11.775* | 15.075 | 13.600 | 13.185 | 14.320 |
| stress-64 | 23.205* | 19.640 | 22.485 | 21.030 | 21.800 |
| stress-256 | 30.345* | 34.380 | 26.460 | 26.335 | 28.245 |
| admission-1024 | 28.305* | 30.880 | 30.585 | 29.855 | 31.765 |
| large-retention | 9.240* | 14.665* | 43.670 | 51.575 | 38.640 |
| expiry-gap | 0.790* | 0.910* | 0.930 | 0.900 | 0.935 |

* = unsupported spacing/expert policy; population/configuration differs. One broad trial,30 samples (120 saturated),not a causal or statistically certain speed comparison.

| H.W scenario | Selected emission / retention | Requested | Spacing | Admitted | Budget drop | TTL | Evictions | Live | History s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| default-two | 512 / 16384 | 2880 | 2640 | 240 | 0 | 0 | 0 | 240 | 5.983 |
| stationary-sixteen | 512 / 16384 | 96000 | 95984 | 16 | 0 | 0 | 0 | 16 | 5.983 |
| moving-sixteen | 512 / 16384 | 96000 | 90240 | 5760 | 0 | 0 | 0 | 5760 | 5.983 |
| dense-sixteen | 512 / 16384 | 96000 | 0 | 96000 | 0 | 0 | 79616 | 16384 | 1.017 |
| expert-sixteen | 4096 / 131072 | 96000 | 0 | 96000 | 0 | 0 | 0 | 96000 | 5.983 |
| saturated-sixteen | 512 / 16384 | 320000 | 300800 | 19200 | 0 | 0 | 2816 | 16384 | 17.050 |
| stress-64 | 512 / 16384 | 384000 | 360960 | 23040 | 0 | 0 | 6656 | 16384 | 4.250 |
| stress-256 | 512 / 16384 | 1536000 | 1443840 | 92160 | 0 | 0 | 75776 | 16384 | 1.050 |
| admission-1024 | 512 / 16384 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 |
| large-retention | 4096 / 131072 | 0 | 0 | 0 | 0 | 0 | 0 | 100000 | 6.000 |
| expiry-gap | 4096 / 131072 | 0 | 0 | 0 | 0 | 100000 | 0 | 0 | 0.000 |

| H.W profiled scenario | Audio FFT | Motion/response | Demand | TTL check | TTL retire | Fair scheduling | Heap admit inclusive | Update | Particles Canvas | Trace Canvas | UI | Diagnostics |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| default-two | 0.215 | 0.005 | 0.005 | 0.000 | 0.000 | 0.000 | 0.000 | 0.020 | 0.185 | 0.020 | 0.210 | 0.005 |
| stationary-sixteen | 0.310 | 0.030 | 0.020 | 0.000 | 0.000 | 0.000 | 0.000 | 0.070 | 0.055 | 0.005 | 0.425 | 0.010 |
| moving-sixteen | 0.770 | 0.020 | 0.020 | 0.005 | 0.000 | 0.005 | 0.000 | 0.060 | 3.045 | 0.100 | 0.515 | 0.015 |
| dense-sixteen | 0.830 | 0.020 | 0.020 | 0.005 | 0.000 | 0.050 | 0.205 | 0.340 | 15.395 | 0.145 | 0.890 | 0.025 |
| expert-sixteen | 0.870 | 0.025 | 0.015 | 0.000 | 0.000 | 0.050 | 0.020 | 0.140 | 175.175 | 0.300 | 0.935 | 0.030 |
| saturated-sixteen | 0.875 | 0.015 | 0.010 | 0.005 | 0.000 | 0.005 | 0.025 | 0.080 | 12.790 | 0.155 | 0.910 | 0.025 |
| stress-64 | 0.890 | 0.045 | 0.035 | 0.010 | 0.000 | 0.025 | 0.060 | 0.210 | 12.910 | 0.425 | 2.345 | 0.025 |
| stress-256 | 0.810 | 0.150 | 0.090 | 0.025 | 0.000 | 0.060 | 0.165 | 0.575 | 10.115 | 0.950 | 6.985 | 0.020 |
| admission-1024 | 0.890 | 0.595 | 0.330 | 0.080 | 0.000 | 0.025 | 0.000 | 1.425 | 0.265 | 0.085 | 31.895 | 0.010 |
| large-retention | 0.870 | 0.030 | 0.020 | 0.000 | 0.000 | 0.000 | 0.000 | 0.070 | 37.620 | 0.190 | 0.920 | 0.015 |
| expiry-gap | 0.185 | 0.015 | 0.010 | 0.000 | 0.000 | 0.000 | 0.000 | 0.040 | 0.010 | 0.005 | 0.290 | 0.005 |

Inclusive/subtracted timers overlap; columns cannot be summed. 0.000 includes below-resolution measurements. Raw JSON retains p95/mean and every measured callback. Canvas is synchronous submission/backpressure,not GPU completion.

| Retention trim, uninstrumented | H.U ms | H.V ms | H.W ms |
| --- | ---: | ---: | ---: |
| dense-sixteen | 2.005 | 2.685 | 2.065 |
| expert-sixteen | 27.430 | 29.215 | 24.905 |
| large-retention | 25.500 | 24.880 | 20.560 |
