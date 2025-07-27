import Compute from "./Compute.wgsl?raw";
import Render from "./Render.wgsl?raw";
enum Material { DIFF, SPEC, REFR };

import {
    Device,
    Shaders,
    type Renderer,
    type Computation
} from "uwal";

export default class Scene
{
    private Renderer!: Renderer;
    private color!: StorageBuffer;

    private Computation!: Computation;
    private canvas!: HTMLCanvasElement;

    private storageBufferSize!: number;
    private workgroupDimension!: number;

    private resizeTimeout?: NodeJS.Timeout;

    public constructor() { Device.OnLost = () => void 0; }

    public setOutputCanvas(canvas: HTMLCanvasElement, width: number, height: number)
    {
        this.canvas = canvas;
        const { devicePixelRatio } = globalThis;
        this.canvas.width = width * devicePixelRatio | 0;
        this.canvas.height = height * devicePixelRatio | 0;
    }

    public async create(canvas: HTMLCanvasElement, width: number, height: number): Promise<number[]>
    {
        this.storageBufferSize = width * height * 16;
        await this.checkRequiredLimits(canvas);

        this.Renderer = new (await Device.Renderer(canvas));
        // Can't update CSS style of an `OffscreenCanvas`:
        this.Renderer.SetCanvasSize(width, height, false);

        await this.createComputePipeline();
        this.createRenderPipeline();
        return [width, height];
    }

    private async checkRequiredLimits(canvas: HTMLCanvasElement): Promise<void>
    {
        const storageBufferBindingSize = this.storageBufferSize * Uint32Array.BYTES_PER_ELEMENT * 4;
        Device.RequiredLimits = { maxStorageBufferBindingSize: storageBufferBindingSize };
        Device.SetRequiredFeatures("bgra8unorm-storage");

        try
        {
            // Device request will fail if the adapter
            // can't provide required limits specified above.
            this.Computation = new (await Device.Computation());
            this.workgroupDimension = this.Computation.GetMaxEvenWorkgroupDimension(2);
        }
        catch (error)
        {
            this.create(canvas, 832, 624);
            console.warn(error);

            console.warn([
                "Will be used a fallback with the minimum `maxStorageBufferBindingSize`",
                "value available in all WebGPU contexts (134217728 bytes [128 MB]),",
                "which produces a 832 x 624 pixel image."
            ].join(" "));
        }
    }

    private async createComputePipeline(): Promise<void>
    {
        const sphereObjects = this.createSpheres();
        const [width, height] = this.Renderer.CanvasSize;
        const ComputePipeline = new this.Computation.Pipeline();

        await this.Computation.AddPipeline(ComputePipeline, {
            constants: { DIMENSION_SIZE: this.workgroupDimension },
            module: ComputePipeline.CreateShaderModule(`
                const SPHERES = ${sphereObjects.length}u;
                ${Compute}
            `)
        });

        const { seed, buffer: seedBuffer } =
            ComputePipeline.CreateUniformBuffer("seed") as UniformBuffer<"seed", Uint32Array>;

        this.color = ComputePipeline.CreateStorageBuffer("color", this.storageBufferSize);

        const { spheres, buffer: spheresBuffer } =
            ComputePipeline.CreateStorageBuffer("spheres", sphereObjects.length);

        for (let s = 0, o = 0; s < sphereObjects.length; s++, o = s * 12)
        {
            spheres[s].p   .set(sphereObjects[s].p   , o + 0);
            spheres[s].rad .set(sphereObjects[s].rad , o + 3);
            spheres[s].e   .set(sphereObjects[s].e   , o + 4);
            spheres[s].refl.set(sphereObjects[s].refl, o + 7);
            spheres[s].c   .set(sphereObjects[s].c   , o + 8);
        }

        this.Computation.WriteBuffer(spheresBuffer, spheres[0].p.buffer);

        seed.forEach((_, s) => seed[s] = Math.random() * 0xffffffff);

        this.Computation.WriteBuffer(seedBuffer, seed);

        ComputePipeline.SetBindGroups(
            ComputePipeline.CreateBindGroup(
                ComputePipeline.CreateBindGroupEntries([
                    this.Renderer.ResolutionBuffer,
                    seedBuffer,
                    this.color.buffer,
                    spheresBuffer
                ])
            )
        );

        this.Computation.Workgroups = [
            width / this.workgroupDimension,
            height / this.workgroupDimension
        ];
    }

    private async createRenderPipeline(): Promise<void>
    {
        const RenderPipeline = new this.Renderer.Pipeline();

        await this.Renderer.AddPipeline(RenderPipeline,
            RenderPipeline.CreateShaderModule([
                Shaders.Resolution,
                Shaders.Quad,
                Render
            ])
        );

        RenderPipeline.SetBindGroups(
            RenderPipeline.CreateBindGroup(
                RenderPipeline.CreateBindGroupEntries([
                    this.Renderer.ResolutionBuffer,
                    this.color.buffer
                ])
            )
        );

        RenderPipeline.SetDrawParams(6);
        this.Computation.Compute();
        this.Renderer.Render();
    }

    public resize(width: number, height: number): void
    {
        clearTimeout(this.resizeTimeout);

        this.resizeTimeout = setTimeout(() =>
        {
            Device.Destroy(this.color.buffer);
            this.create(this.Renderer.Canvas, width, height);
            this.setOutputCanvas(this.canvas, width, height);
        }, 500);
    }

    private createSpheres(): Sphere[]
    {
        return [{
            p: [1e5 + 1, 40.8, 81.6],
            rad: [1e5],
            e: [0, 0, 0],
            refl: [Material.DIFF],
            c: [0.75, 0.25, 0.25]
        }, {
            p: [-1e5 + 99, 40.8, 81.6],
            rad: [1e5],
            e: [0, 0, 0],
            refl: [Material.DIFF],
            c: [0.25, 0.25, 0.75]
        }, {
            p: [50, 40.8, 1e5],
            rad: [1e5],
            e: [0, 0, 0],
            refl: [Material.DIFF],
            c: [0.75, 0.75, 0.75]
        }, {
            p: [50, 40.8, -1e5 + 170],
            rad: [1e5],
            e: [0, 0, 0],
            refl: [Material.DIFF],
            c: [0, 0, 0]
        }, {
            p: [50, 1e5, 81.6],
            rad: [1e5],
            e: [0, 0, 0],
            refl: [Material.DIFF],
            c: [0.75, 0.75, 0.75]
        }, {
            p: [50, -1e5 + 81.6, 81.6],
            rad: [1e5],
            e: [0, 0, 0],
            refl: [Material.DIFF],
            c: [0.75, 0.75, 0.75]
        }, {
            p: [27, 16.5, 47],
            rad: [16.5],
            e: [0, 0, 0],
            refl: [Material.SPEC],
            c: [0.999, 0.999, 0.999]
        }, {
            p: [73, 16.5, 78],
            rad: [16.5],
            e: [0, 0, 0],
            refl: [Material.REFR],
            c: [0.999, 0.999, 0.999]
        }, {
            p: [50, 681.6 - 0.27, 81.6],
            rad: [600],
            e: [12, 12, 12],
            refl: [Material.DIFF],
            c: [0, 0, 0]
        } /*, {
            p: [50, 81.6 - 16.5, 81.6],
            rad: [1.5],
            e: [400, 400, 400],
            refl: [Material.DIFF],
            c: [0, 0, 0]
        } */];
    }
}
