import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getAuthToken } from '@/api/client';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

interface ModelViewerProps {
  fileUrl: string;
  filename: string;
  height?: number;
  thumbnailUrl?: string;
}

/**
 * Interactive 3D model viewer using Three.js in a WebView.
 * For raw .stl/.3mf: fetches model, parses mesh, renders 3D.
 * For sliced .gcode.3mf: shows the plate thumbnail image.
 */
export function ModelViewer({ fileUrl, filename, height = 300, thumbnailUrl }: ModelViewerProps) {
  const { isDark, colors } = useTheme();
  const isSliced = /\.gcode\.3mf$/i.test(filename);
  const format = /\.stl$/i.test(filename) ? 'stl' : '3mf';
  const [modelBase64, setModelBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSliced) return; // Don't fetch for sliced files
    let cancelled = false;
    setModelBase64(null);
    setError(null);

    fetch(fileUrl, {
      headers: {
        ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      },
    })
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buf => {
        if (cancelled) return;
        // Convert ArrayBuffer to base64 (RN global btoa available since 0.73)
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunkSize = 4096;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          binary += String.fromCharCode.apply(null, chunk as any);
        }
        setModelBase64((globalThis as any).btoa(binary));
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to download');
      });

    return () => { cancelled = true; };
  }, [fileUrl, isSliced]);

  const htmlContent = useMemo(() => {
    if (!modelBase64) return null;
    const bgColor = isDark ? '#1a1a1a' : '#f5f5f5';
    const gridColor = isDark ? '#333333' : '#cccccc';
    const modelColor = isDark ? '#66bb6a' : '#4caf50';
    return buildViewerHtml(modelBase64, format, bgColor, gridColor, modelColor);
  }, [modelBase64, format, isDark]);

  // For sliced files, just show thumbnail
  if (isSliced && thumbnailUrl) {
    return (
      <View style={[styles.container, { height }]}>
        <Image
          source={{ uri: thumbnailUrl }}
          style={styles.thumbnail}
          resizeMode="contain"
        />
      </View>
    );
  }

  // For sliced files without thumbnail, show note
  if (isSliced) {
    return (
      <View style={[styles.container, styles.centered, { height: height / 2 }]}>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Sliced file — no 3D geometry available
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { height }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      </View>
    );
  }

  if (!htmlContent) {
    return (
      <View style={[styles.container, styles.centered, { height }]}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Downloading model…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html: htmlContent }}
        style={styles.webview}
        {...({ originWhitelist: ['*'], javaScriptEnabled: true } as any)}
      />
    </View>
  );
}

function buildViewerHtml(
  modelBase64: string,
  format: 'stl' | '3mf',
  bgColor: string,
  gridColor: string,
  modelColor: string,
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: ${bgColor}; touch-action: none; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #status {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; align-items: center; justify-content: center;
      color: #888; font-family: -apple-system, sans-serif; font-size: 14px;
      text-align: center; padding: 20px;
    }
    #status.error { color: #e57373; }
  </style>
</head>
<body>
  <div id="status">Loading renderer…</div>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"><\/script>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
  }
  <\/script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { STLLoader } from 'three/addons/loaders/STLLoader.js';

    var statusEl = document.getElementById('status');
    function showError(msg) { statusEl.className = 'error'; statusEl.textContent = msg; }

      try {
        var scene = new THREE.Scene();
        scene.background = new THREE.Color('${bgColor}');
        var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
        var renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(renderer.domElement);

        var controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.rotateSpeed = 0.8;
        controls.zoomSpeed = 1.2;

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1, 2, 1.5);
        scene.add(dirLight);
        var backLight = new THREE.DirectionalLight(0xffffff, 0.3);
        backLight.position.set(-1, -1, -1);
        scene.add(backLight);

        var grid = new THREE.GridHelper(200, 20, '${gridColor}', '${gridColor}');
        grid.material.opacity = 0.4;
        grid.material.transparent = true;
        scene.add(grid);

        function addMeshToScene(geometry) {
          statusEl.style.display = 'none';
          geometry.computeVertexNormals();
          var material = new THREE.MeshPhongMaterial({ color: '${modelColor}', specular: 0x222222, shininess: 40 });
          var mesh = new THREE.Mesh(geometry, material);

          geometry.computeBoundingBox();
          var center = new THREE.Vector3();
          geometry.boundingBox.getCenter(center);
          mesh.position.sub(center);

          var size = new THREE.Vector3();
          geometry.boundingBox.getSize(size);
          var maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) mesh.scale.setScalar(100 / maxDim);

          var scaledBox = new THREE.Box3().setFromObject(mesh);
          mesh.position.y -= scaledBox.min.y;
          scene.add(mesh);

          var finalBox = new THREE.Box3().setFromObject(mesh);
          var fs = new THREE.Vector3();
          finalBox.getSize(fs);
          var dist = Math.max(fs.x, fs.y, fs.z) * 1.8;
          camera.position.set(dist * 0.7, dist * 0.5, dist * 0.7);
          camera.lookAt(0, fs.y * 0.3, 0);
          controls.target.set(0, fs.y * 0.3, 0);
          controls.update();
        }

        function base64ToArrayBuffer(b64) {
          var raw = atob(b64);
          var arr = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
          return arr.buffer;
        }

        function extractMeshData(xmlText) {
          // Use regex-based parsing — more resilient than DOM across WebView implementations
          var vertexRegex = /<[^>]*vertex[^>]+x="([^"]*)"[^>]+y="([^"]*)"[^>]+z="([^"]*)"/gi;
          var triRegex = /<[^>]*triangle[^>]+v1="([^"]*)"[^>]+v2="([^"]*)"[^>]+v3="([^"]*)"/gi;
          
          var positions = [], indices = [], vertexCount = 0;
          var match;
          while ((match = vertexRegex.exec(xmlText)) !== null) {
            positions.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
            vertexCount++;
          }
          while ((match = triRegex.exec(xmlText)) !== null) {
            indices.push(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
          }
          if (!positions.length) return null;
          return { positions: positions, indices: indices, vertexCount: vertexCount };
        }

        statusEl.textContent = 'Processing model…';
        var modelData = base64ToArrayBuffer('${modelBase64}');

        if ('${format}' === 'stl') {
          var loader = new STLLoader();
          var geometry = loader.parse(modelData);
          addMeshToScene(geometry);
        } else {
          JSZip.loadAsync(modelData).then(function(zip) {
            var modelFiles = [];
            var keys = Object.keys(zip.files);
            for (var k = 0; k < keys.length; k++) {
              if (/\\.model$/i.test(keys[k]) && !zip.files[keys[k]].dir) {
                modelFiles.push(zip.files[keys[k]]);
              }
            }
            if (!modelFiles.length) throw new Error('No 3D model data in archive');
            return Promise.all(modelFiles.map(function(f) { return f.async('string'); }));
          }).then(function(xmlTexts) {
            var allPositions = [], allIndices = [], vertexOffset = 0;
            for (var t = 0; t < xmlTexts.length; t++) {
              var result = extractMeshData(xmlTexts[t]);
              if (result) {
                for (var i = 0; i < result.positions.length; i++) allPositions.push(result.positions[i]);
                for (var j = 0; j < result.indices.length; j++) allIndices.push(result.indices[j] + vertexOffset);
                vertexOffset += result.vertexCount;
              }
            }
            if (!allPositions.length) throw new Error('No mesh geometry found');
            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
            geometry.setIndex(allIndices);
            addMeshToScene(geometry);
          }).catch(function(err) { showError(err.message || 'Failed to parse'); });
        }

        function animate() {
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('resize', function() {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        });
      } catch(e) {
        showError(e.message || 'Viewer error');
      }
  <\/script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  thumbnail: {
    flex: 1,
    borderRadius: 12,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: 13,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  infoText: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
