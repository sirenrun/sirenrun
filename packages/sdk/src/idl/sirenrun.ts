/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sirenrun.json`.
 */
export type Sirenrun = {
  "address": "8NnGx94QrpwcUW6LL7NBzbgrTPUfVyaLsd8iHnfserHj",
  "metadata": {
    "name": "sirenrun",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SIRENRUN onchain program"
  },
  "instructions": [
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "sessionToken",
          "optional": true
        },
        {
          "name": "traderBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "traderBalance.owner",
                "account": "balance"
              }
            ]
          }
        },
        {
          "name": "houseBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.house",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "arena",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "market",
          "type": "u8"
        },
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minShares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "sessionToken",
          "optional": true
        },
        {
          "name": "traderBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "traderBalance.owner",
                "account": "balance"
              }
            ]
          }
        },
        {
          "name": "houseBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.house",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "arena"
        }
      ],
      "args": [
        {
          "name": "entryIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "delegateArena",
      "discriminator": [
        216,
        55,
        214,
        212,
        195,
        162,
        39,
        100
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bufferArena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "arena"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                109,
                150,
                50,
                182,
                71,
                25,
                15,
                197,
                109,
                165,
                98,
                80,
                157,
                138,
                193,
                9,
                159,
                183,
                115,
                84,
                54,
                15,
                192,
                173,
                83,
                41,
                22,
                47,
                6,
                135,
                162,
                150
              ]
            }
          }
        },
        {
          "name": "delegationRecordArena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "arena"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataArena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "arena"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "8NnGx94QrpwcUW6LL7NBzbgrTPUfVyaLsd8iHnfserHj"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u8"
        }
      ]
    },
    {
      "name": "delegateBalance",
      "discriminator": [
        199,
        112,
        131,
        196,
        76,
        135,
        198,
        238
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "bufferBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "balance"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                109,
                150,
                50,
                182,
                71,
                25,
                15,
                197,
                109,
                165,
                98,
                80,
                157,
                138,
                193,
                9,
                159,
                183,
                115,
                84,
                54,
                15,
                192,
                173,
                83,
                41,
                22,
                47,
                6,
                135,
                162,
                150
              ]
            }
          }
        },
        {
          "name": "delegationRecordBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "balance"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "balance"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "8NnGx94QrpwcUW6LL7NBzbgrTPUfVyaLsd8iHnfserHj"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "balance"
          ]
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initArena",
      "discriminator": [
        24,
        246,
        252,
        176,
        155,
        175,
        123,
        124
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initBalance",
      "discriminator": [
        174,
        51,
        4,
        34,
        196,
        72,
        204,
        66
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initConfig",
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "configParams"
            }
          }
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "recoverArena",
      "discriminator": [
        90,
        41,
        181,
        193,
        200,
        3,
        137,
        54
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "arena",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "setInput",
      "discriminator": [
        139,
        39,
        34,
        55,
        105,
        172,
        163,
        255
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "sessionToken",
          "optional": true
        },
        {
          "name": "arena",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "targetLane",
          "type": "u8"
        },
        {
          "name": "nitro",
          "type": "bool"
        }
      ]
    },
    {
      "name": "startRun",
      "discriminator": [
        72,
        212,
        1,
        91,
        61,
        186,
        2,
        52
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "sessionToken",
          "optional": true
        },
        {
          "name": "runnerBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "runnerBalance.owner",
                "account": "balance"
              }
            ]
          }
        },
        {
          "name": "houseBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.house",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "programIdentity",
          "address": "37HL9DPN7nLNtK24UDFfwTXKjbsL5XwbjfDXhdtSX3CT"
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "tick",
      "discriminator": [
        92,
        79,
        44,
        8,
        101,
        80,
        63,
        15
      ],
      "accounts": [
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "runnerBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "arena.runner",
                "account": "arena"
              }
            ]
          }
        },
        {
          "name": "houseBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.house",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "crankSigner",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u32"
        }
      ]
    },
    {
      "name": "undelegateBalance",
      "discriminator": [
        7,
        32,
        46,
        225,
        36,
        220,
        19,
        101
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "sessionToken",
          "optional": true
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "balance.owner",
                "account": "balance"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "arena0"
        },
        {
          "name": "arena1"
        },
        {
          "name": "arena2"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "configParams"
            }
          }
        }
      ]
    },
    {
      "name": "vrfCallbackSeed",
      "discriminator": [
        187,
        189,
        228,
        7,
        86,
        222,
        201,
        234
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "signer": true,
          "address": "Ao4WRmrvcfdZUqnTtar5DnLHJH8Bn9kEfQkwbTbezF76"
        },
        {
          "name": "arena",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "nonce",
          "type": "u32"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "balance"
          ]
        },
        {
          "name": "balance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "arena",
      "discriminator": [
        243,
        215,
        44,
        44,
        231,
        211,
        232,
        168
      ]
    },
    {
      "name": "balance",
      "discriminator": [
        127,
        71,
        25,
        157,
        105,
        157,
        241,
        182
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    }
  ],
  "events": [
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "lineCrossed",
      "discriminator": [
        89,
        108,
        163,
        112,
        190,
        115,
        57,
        207
      ]
    },
    {
      "name": "runSettled",
      "discriminator": [
        11,
        20,
        18,
        58,
        176,
        238,
        55,
        27
      ]
    },
    {
      "name": "runStarted",
      "discriminator": [
        204,
        211,
        34,
        240,
        253,
        194,
        41,
        122
      ]
    },
    {
      "name": "seedSet",
      "discriminator": [
        9,
        179,
        143,
        172,
        250,
        146,
        42,
        6
      ]
    },
    {
      "name": "trade",
      "discriminator": [
        24,
        254,
        218,
        152,
        253,
        43,
        18,
        81
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "arenaBusy",
      "msg": "Arena is busy"
    },
    {
      "code": 6001,
      "name": "arenaNotLive",
      "msg": "Arena is not live"
    },
    {
      "code": 6002,
      "name": "marketClosed",
      "msg": "Market is closed"
    },
    {
      "code": 6003,
      "name": "insufficientBalance",
      "msg": "Insufficient balance"
    },
    {
      "code": 6004,
      "name": "houseInsufficient",
      "msg": "House balance is too low"
    },
    {
      "code": 6005,
      "name": "tooLarge",
      "msg": "Amount is too large"
    },
    {
      "code": 6006,
      "name": "slippage",
      "msg": "Slippage limit exceeded"
    },
    {
      "code": 6007,
      "name": "noInterestCapReached",
      "msg": "NO interest cap reached"
    },
    {
      "code": 6008,
      "name": "runnerCannotTrade",
      "msg": "The driver cannot trade their own run"
    },
    {
      "code": 6009,
      "name": "noFreeEntry",
      "msg": "No free position entry"
    },
    {
      "code": 6010,
      "name": "notResolved",
      "msg": "Market is not resolved"
    },
    {
      "code": 6011,
      "name": "resultExpired",
      "msg": "Run result has expired"
    },
    {
      "code": 6012,
      "name": "invalidLane",
      "msg": "Invalid lane"
    },
    {
      "code": 6013,
      "name": "unauthorized",
      "msg": "Unauthorized"
    },
    {
      "code": 6014,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6015,
      "name": "seedNotReady",
      "msg": "Seed is not ready"
    },
    {
      "code": 6016,
      "name": "invalidConfig",
      "msg": "Invalid config parameters"
    },
    {
      "code": 6017,
      "name": "invalidArena",
      "msg": "Invalid arena id"
    },
    {
      "code": 6018,
      "name": "noEntry",
      "msg": "No position in this entry"
    },
    {
      "code": 6019,
      "name": "balanceInUse",
      "msg": "Balance is in use by a run"
    },
    {
      "code": 6020,
      "name": "arenaNotSettled",
      "msg": "Arena is not settled"
    }
  ],
  "types": [
    {
      "name": "arena",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "arenaStatus"
              }
            }
          },
          {
            "name": "phaseTicks",
            "type": "u16"
          },
          {
            "name": "nonce",
            "type": "u32"
          },
          {
            "name": "runner",
            "type": "pubkey"
          },
          {
            "name": "seedReady",
            "type": "bool"
          },
          {
            "name": "seed",
            "type": "u64"
          },
          {
            "name": "sim",
            "type": {
              "defined": {
                "name": "runSim"
              }
            }
          },
          {
            "name": "bond",
            "type": "u64"
          },
          {
            "name": "runnerFees",
            "type": "u64"
          },
          {
            "name": "markets",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "market"
                  }
                },
                3
              ]
            }
          },
          {
            "name": "results",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "runResult"
                  }
                },
                16
              ]
            }
          },
          {
            "name": "resultsHead",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arenaStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "idle"
          },
          {
            "name": "staging"
          },
          {
            "name": "live"
          },
          {
            "name": "settled"
          }
        ]
      }
    },
    {
      "name": "balance",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "available",
            "type": "u64"
          },
          {
            "name": "entries",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "positionEntry"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u32"
          },
          {
            "name": "market",
            "type": "u8"
          },
          {
            "name": "paid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "house",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "runnerFeeBps",
            "type": "u16"
          },
          {
            "name": "entryFee",
            "type": "u64"
          },
          {
            "name": "bond",
            "type": "u64"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "maxBuy",
            "type": "u64"
          },
          {
            "name": "nitroFee",
            "docs": [
              "Charged to the driver each time a nitro charge fires; unused charges cost nothing."
            ],
            "type": "u64"
          },
          {
            "name": "openBps",
            "docs": [
              "Opening RIDE (YES) price per line in bps, so no market opens at a free 50/50."
            ],
            "type": {
              "array": [
                "u16",
                3
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "house",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "runnerFeeBps",
            "type": "u16"
          },
          {
            "name": "entryFee",
            "type": "u64"
          },
          {
            "name": "bond",
            "type": "u64"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "maxBuy",
            "type": "u64"
          },
          {
            "name": "nitroFee",
            "type": "u64"
          },
          {
            "name": "openBps",
            "type": {
              "array": [
                "u16",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "lineCrossed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u32"
          },
          {
            "name": "market",
            "type": "u8"
          },
          {
            "name": "t",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "line",
            "type": "u16"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "yesR",
            "type": "u64"
          },
          {
            "name": "noR",
            "type": "u64"
          },
          {
            "name": "resolvedTick",
            "type": "u32"
          },
          {
            "name": "houseYes",
            "docs": [
              "Tokens the house minted at the opening but kept out of the pool (see `open_pool`)."
            ],
            "type": "u64"
          },
          {
            "name": "houseNo",
            "type": "u64"
          },
          {
            "name": "noProfit",
            "docs": [
              "What BUST holders would win here on a bust: sum of `shares - net` over NO buys."
            ],
            "type": "u64"
          },
          {
            "name": "rideCost",
            "docs": [
              "Sum of `net` over RIDE buys, to share a forfeited bond between them."
            ],
            "type": "u64"
          },
          {
            "name": "rideBackBps",
            "docs": [
              "Share of a losing RIDE position's cost refunded from the driver's bond, set on bust."
            ],
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "yes"
          },
          {
            "name": "no"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "positionEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arenaId",
            "type": "u8"
          },
          {
            "name": "nonce",
            "type": "u32"
          },
          {
            "name": "market",
            "type": "u8"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "cost",
            "type": "u64"
          },
          {
            "name": "tick",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "runResult",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u32"
          },
          {
            "name": "outcomes",
            "type": "u8"
          },
          {
            "name": "resolvedTicks",
            "type": {
              "array": [
                "u32",
                3
              ]
            }
          },
          {
            "name": "rideBackBps",
            "type": {
              "array": [
                "u16",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "runSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u32"
          },
          {
            "name": "t",
            "type": "u32"
          },
          {
            "name": "outcomes",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "runSim",
      "docs": [
        "Borsh copy of `sim::SimState`, so the pure sim module stays free of Anchor."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "t",
            "type": "u32"
          },
          {
            "name": "carX",
            "type": "u16"
          },
          {
            "name": "targetLane",
            "type": "u8"
          },
          {
            "name": "speed",
            "type": "u16"
          },
          {
            "name": "nitroLeft",
            "type": "u8"
          },
          {
            "name": "nitroTicks",
            "type": "u8"
          },
          {
            "name": "invuln",
            "type": "u8"
          },
          {
            "name": "distance",
            "type": "u32"
          },
          {
            "name": "row",
            "type": "u32"
          },
          {
            "name": "safeLane",
            "type": "u8"
          },
          {
            "name": "policeGap",
            "type": "i32"
          },
          {
            "name": "busted",
            "type": "bool"
          },
          {
            "name": "nitroPressed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "runStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u32"
          },
          {
            "name": "runner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "seedSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "sessionTokenV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "targetProgram",
            "type": "pubkey"
          },
          {
            "name": "sessionSigner",
            "type": "pubkey"
          },
          {
            "name": "feePayer",
            "type": "pubkey"
          },
          {
            "name": "validUntil",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "yes"
          },
          {
            "name": "no"
          }
        ]
      }
    },
    {
      "name": "trade",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u32"
          },
          {
            "name": "market",
            "type": "u8"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "net",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "yesR",
            "type": "u64"
          },
          {
            "name": "noR",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
