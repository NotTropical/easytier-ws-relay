use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_dir: PathBuf = ["..", "protos"].iter().collect();
    let extra_proto_dir: PathBuf = ["..", "protos"].iter().collect();

    let proto_files = [
        proto_dir.join("peer_rpc.proto"),
        proto_dir.join("common.proto"),
        proto_dir.join("error.proto"),
    ];

    for pf in &proto_files {
        println!("cargo:rerun-if-changed={}", pf.display());
    }

    let mut config = prost_build::Config::new();
    config
        .protoc_arg("--experimental_allow_proto3_optional")
        .type_attribute(".acl", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".common", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".error", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".api", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".web", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".config", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".peer_rpc", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute("peer_rpc.DirectConnectedPeerInfo", "#[derive(Hash)]")
        .type_attribute("peer_rpc.PeerInfoForGlobalMap", "#[derive(Hash)]")
        .type_attribute("peer_rpc.ForeignNetworkRouteInfoKey", "#[derive(Hash, Eq)]")
        .type_attribute(
            "peer_rpc.RouteForeignNetworkSummary.Info",
            "#[derive(Hash, Eq)]",
        )
        .type_attribute(
            "peer_rpc.RouteForeignNetworkSummary",
            "#[derive(Hash, Eq)]",
        )
        .type_attribute("common.RpcDescriptor", "#[derive(Hash, Eq)]")
        .extern_path(".google.protobuf.Timestamp", "crate::proto::Timestamp")
        .btree_map(["."]);

    config.compile_protos(
        &proto_files,
        &[proto_dir.as_path(), extra_proto_dir.as_path()],
    )?;

    Ok(())
}
