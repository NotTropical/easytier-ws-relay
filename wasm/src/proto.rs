pub mod peer_rpc {
    include!(concat!(env!("OUT_DIR"), "/peer_rpc.rs"));
}

pub mod common {
    include!(concat!(env!("OUT_DIR"), "/common.rs"));
}

pub mod error {
    include!(concat!(env!("OUT_DIR"), "/error.rs"));
}

/// Custom Timestamp type that implements both prost::Message and serde traits.
/// Replaces google.protobuf.Timestamp in generated code via extern_path.
#[derive(Clone, Copy, PartialEq, ::prost::Message, serde::Serialize, serde::Deserialize)]
pub struct Timestamp {
    #[prost(int64, tag = "1")]
    pub seconds: i64,
    #[prost(int32, tag = "2")]
    pub nanos: i32,
}

impl From<prost_types::Timestamp> for Timestamp {
    fn from(t: prost_types::Timestamp) -> Self {
        Timestamp {
            seconds: t.seconds,
            nanos: t.nanos,
        }
    }
}

impl From<Timestamp> for prost_types::Timestamp {
    fn from(t: Timestamp) -> Self {
        prost_types::Timestamp {
            seconds: t.seconds,
            nanos: t.nanos,
        }
    }
}
