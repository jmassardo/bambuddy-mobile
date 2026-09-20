import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Linking } from 'react-native';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Download, Share as ShareIcon, X } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, spacing } from '@/theme/tokens';

interface Model3DPreviewRouteParams {
  fileId?: number;
  archiveId?: number;
  filename: string;
  fileUrl?: string;
  fileSize?: number;
  source3mfPath?: string;
}

/**
 * Full-screen 3D model preview screen.
 * Renders STL/3MF models using Three.js in a WebView with orbit controls.
 */
export default function Model3DPreviewScreen() {
  const navigation = useNavigation<RootNavigationProp<'Model3DPreview'>>();
  const route = useRoute<RootRouteProp<'Model3DPreview'>>();
  const params = (route.params ?? {}) as Model3DPreviewRouteParams;
  const { colors, isDark } = useTheme();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  const buildViewerHtml = useCallback(
    (bgColor: string, modelColor: string, gridColor: string) => {
      const modelUrlStr = params.fileUrl
        ? `'${params.fileUrl.replace(/'/g, "\\'")}'`
        : 'null';
      const closeScript = '<' + '/script>';
      return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: ${bgColor}; touch-action: none; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #overlay {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      color: #888; font-family: -apple-system, sans-serif; font-size: 14px;
      text-align: center; padding: 20px; gap: 12px;
    }
    #overlay.error { color: #e57373; }
    #overlay.done { display: none; }
    #info {
      position: absolute; bottom: 16px; left: 16px; right: 16px;
      background: rgba(0,0,0,0.6); border-radius: 8px;
      padding: 8px 12px; color: #ccc; font-size: 11px;
      font-family: -apple-system, sans-serif;
    }
  </style>
</head>
<body>
  <div id="overlay">Loading 3D model...</div>
  <div id="info">${params.filename} • Drag to rotate · Pinch to zoom</div>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js">${closeScript}
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
  }
  ${closeScript}
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { STLLoader } from 'three/addons/loaders/STLLoader.js';

    const overlay = document.getElementById('overlay');
    const modelUrl = ${modelUrlStr};
    const source3mf = ${params.source3mfPath ? `'${params.source3mfPath.replace(/'/g, "\\'")}'` : 'null'};
    const archiveId = ${params.archiveId ?? 'null'};

    async function loadModel() {
      try {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('${bgColor}');
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.rotateSpeed = 0.8;
        controls.zoomSpeed = 1.2;

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1, 2, 1.5);
        scene.add(dirLight);
        const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
        backLight.position.set(-1, -1, -1);
        scene.add(backLight);

        const grid = new THREE.GridHelper(200, 20, '${gridColor}', '${gridColor}');
        grid.material.opacity = 0.4;
        grid.material.transparent = true;
        scene.add(grid);

        function addMesh(geometry) {
          geometry.computeVertexNormals();
          const material = new THREE.MeshPhongMaterial({
            color: '${modelColor}',
            specular: 0x222222,
            shininess: 40,
          });
          const mesh = new THREE.Mesh(geometry, material);
          geometry.computeBoundingBox();
          const center = new THREE.Vector3();
          geometry.boundingBox.getCenter(center);
          mesh.position.sub(center);
          const size = new THREE.Vector3();
          geometry.boundingBox.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) mesh.scale.setScalar(100 / maxDim);
          const scaledBox = new THREE.Box3().setFromObject(mesh);
          mesh.position.y -= scaledBox.min.y;
          scene.add(mesh);
          const finalBox = new THREE.Box3().setFromObject(mesh);
          const fs = new THREE.Vector3();
          finalBox.getSize(fs);
          const dist = Math.max(fs.x, fs.y, fs.z) * 1.8;
          camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
          camera.lookAt(0, fs.y * 0.3, 0);
          controls.target.set(0, fs.y * 0.3, 0);
          controls.update();
        }

        function base64ToArrayBuffer(b64) {
          const raw = atob(b64);
          const arr = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          return arr.buffer;
        }

        function extractMeshData(xmlText) {
          const vertexRegex = /<[^>]*vertex[^>]+x="([^"]*)"[^>]+y="([^"]*)"[^>]+z="([^"]*)"/gi;
          const triRegex = /<[^>]*triangle[^>]+v1="([^"]*)"[^>]+v2="([^"]*)"[^>]+v3="([^"]*)"/gi;
          const positions = [], indices = [], vertexCount = 0;
          let match;
          while ((match = vertexRegex.exec(xmlText)) !== null) {
            positions.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
          }
          while ((match = triRegex.exec(xmlText)) !== null) {
            indices.push(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
          }
          if (!positions.length) return null;
          return { positions, indices };
        }

        overlay.textContent = 'Downloading model...';

        if (modelUrl) {
          const ext = modelUrl.toLowerCase();
          if (ext.endsWith('.stl')) {
            const resp = await fetch(modelUrl);
            const buf = await resp.arrayBuffer();
            const geometry = new STLLoader().parse(buf);
            addMesh(geometry);
          } else if (ext.endsWith('.3mf')) {
            const resp = await fetch(modelUrl);
            const buf = await resp.arrayBuffer();
            const zip = await JSZip.loadAsync(buf);
            const modelFiles = [];
            const keys = Object.keys(zip.files);
            for (let k = 0; k < keys.length; k++) {
              if (/\\.model$/i.test(keys[k]) && !zip.files[keys[k]].dir) {
                modelFiles.push(zip.files[keys[k]]);
              }
            }
            if (!modelFiles.length) throw new Error('No 3D model data in archive');
            const xmlTexts = await Promise.all(
              modelFiles.map(f => f.async('string'))
            );
            let allPositions = [], allIndices = [], offset = 0;
            for (const xmlText of xmlTexts) {
              const result = extractMeshData(xmlText);
              if (result) {
                allPositions = allPositions.concat(result.positions);
                result.indices.forEach(i => allIndices.push(i + offset));
                offset += result.positions.length / 3;
              }
            }
            if (!allPositions.length) throw new Error('No mesh geometry found');
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
            geometry.setIndex(allIndices);
            addMesh(geometry);
          } else {
            throw new Error('Unsupported format');
          }
        } else if (source3mf && archiveId) {
          const downloadUrl = '/api/v1/archives/' + archiveId + source3mf;
          const resp = await fetch(downloadUrl);
          if (!resp.ok) throw new Error('Failed to download source 3MF');
          const buf = await resp.arrayBuffer();
          const zip = await JSZip.loadAsync(buf);
          const modelFiles = [];
          const keys = Object.keys(zip.files);
          for (let k = 0; k < keys.length; k++) {
            if (/\\.model$/i.test(keys[k]) && !zip.files[keys[k]].dir) {
              modelFiles.push(zip.files[keys[k]]);
            }
          }
          if (!modelFiles.length) throw new Error('No 3D model data in archive');
          const xmlTexts = await Promise.all(
            modelFiles.map(f => f.async('string'))
          );
          let allPositions = [], allIndices = [], offset = 0;
          for (const xmlText of xmlTexts) {
            const result = extractMeshData(xmlText);
            if (result) {
              allPositions = allPositions.concat(result.positions);
              result.indices.forEach(i => allIndices.push(i + offset));
              offset += result.positions.length / 3;
            }
          }
          if (!allPositions.length) throw new Error('No mesh geometry found');
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
          geometry.setIndex(allIndices);
          addMesh(geometry);
        } else {
          throw new Error('No model source available');
        }

        overlay.className = 'done';
      } catch (e) {
        overlay.className = 'error';
        overlay.textContent = e.message || 'Failed to load model';
      }
    }

    loadModel();

    const scene = new THREE.Scene();
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  ${closeScript}
</body>
</html>`;
    },
    [
      params.filename,
      params.fileUrl,
      params.source3mfPath,
      params.archiveId,
    ],
  );

  React.useEffect(() => {
    const bgColor = isDark ? colors.background : colors.surface;
    const gridColor = isDark ? colors.border : colors.borderSubtle;
    const modelColor = colors.success;
    const html = buildViewerHtml(bgColor, modelColor, gridColor);
    setHtmlContent(html);
    setIsLoading(false);
  }, [isDark, buildViewerHtml]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out this 3D model: ${params.filename}`,
      });
    } catch {
      // Share cancelled or failed — no action needed
    }
  }, [params.filename]);

  const handleDownload = useCallback(() => {
    if (params.fileId != null) {
      const url = api.getLibraryFileDownloadUrl(params.fileId);
      Linking.openURL(url).catch(() => {
        showToast('Could not open download link.', 'error');
      });
    }
  }, [params.fileId, showToast]);

  const headerButtons = useMemo(() => (
    <View style={styles.headerActions}>
      <Pressable
        onPress={handleShare}
        style={[styles.headerButton, { marginRight: spacing.sm }]}
        hitSlop={8}
      >
        <ShareIcon size={18} color={colors.text} strokeWidth={2} />
      </Pressable>
      <Pressable
        onPress={handleDownload}
        style={[styles.headerButton, { marginRight: spacing.sm }]}
        hitSlop={8}
      >
        <Download size={18} color={colors.text} strokeWidth={2} />
      </Pressable>
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.headerButton}
        hitSlop={8}
      >
        <X size={18} color={colors.text} strokeWidth={2} />
      </Pressable>
    </View>
  ), [handleShare, handleDownload, colors.text, navigation]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: params.filename,
      headerRight: () => headerButtons,
    });
  }, [navigation, params.filename, headerButtons]);

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Initializing 3D viewer…
          </Text>
        </View>
      ) : (
        <WebView
          source={{ html: htmlContent ?? '' }}
          style={styles.webview}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          {...({ allowsFullscreenVideo: false } as any)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
    padding: spacing.lg,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
