
            /// Returns the `rustc` SemVer version and additional metadata
            /// like the git short hash and build date.
            pub fn version_meta() -> VersionMeta {
                VersionMeta {
                    semver: Version {
                        major: 1,
                        minor: 99,
                        patch: 1,
                        pre: Prerelease::new("").unwrap(),
                        build: BuildMetadata::new("").unwrap(),
                    },
                    host: "x86_64-unknown-linux-gnu".to_owned(),
                    short_version_string: "rustc 1.99.1 (58cf8f9c3 2026-10-13)".to_owned(),
                    commit_hash: Some("58cf8f9c35b355199727627d07ae34a4e2846d67".to_owned()),
                    commit_date: Some("2026-10-13".to_owned()),
                    build_date: None,
                    channel: Channel::Stable,
                    llvm_version: Some(LlvmVersion{ major: 23, minor: 1 }),
                }
            }
            