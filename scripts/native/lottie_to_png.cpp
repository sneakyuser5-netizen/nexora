#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <filesystem>
#include <png.h>
#include "rlottie_capi.h"

namespace fs = std::filesystem;

static bool write_png(const std::string &path,
                      const uint32_t *pixels,
                      size_t width,
                      size_t height) {
    FILE *fp = fopen(path.c_str(), "wb");
    if (!fp) return false;

    png_structp png = png_create_write_struct(
        PNG_LIBPNG_VER_STRING, nullptr, nullptr, nullptr
    );
    if (!png) {
        fclose(fp);
        return false;
    }

    png_infop info = png_create_info_struct(png);
    if (!info) {
        png_destroy_write_struct(&png, nullptr);
        fclose(fp);
        return false;
    }

    if (setjmp(png_jmpbuf(png))) {
        png_destroy_write_struct(&png, &info);
        fclose(fp);
        return false;
    }

    png_init_io(png, fp);
    png_set_IHDR(
        png, info, width, height, 8,
        PNG_COLOR_TYPE_RGBA, PNG_INTERLACE_NONE,
        PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT
    );
    png_write_info(png, info);

    std::vector<uint8_t> rgba(width * height * 4);

    for (size_t i = 0; i < width * height; ++i) {
        uint32_t p = pixels[i];

        rgba[i * 4 + 0] = (p >> 16) & 0xff;
        rgba[i * 4 + 1] = (p >> 8) & 0xff;
        rgba[i * 4 + 2] = p & 0xff;
        rgba[i * 4 + 3] = (p >> 24) & 0xff;
    }

    std::vector<png_bytep> rows(height);
    for (size_t y = 0; y < height; ++y) {
        rows[y] = rgba.data() + y * width * 4;
    }

    png_write_image(png, rows.data());
    png_write_end(png, nullptr);

    png_destroy_write_struct(&png, &info);
    fclose(fp);
    return true;
}

int main(int argc, char **argv) {
    if (argc < 3 || argc > 5) {
        fprintf(stderr,
            "Usage: %s input.json output_dir [width] [max_frames]\n",
            argv[0]);
        return 2;
    }

    const std::string input = argv[1];
    const std::string output = argv[2];

    size_t width = argc >= 4 ? std::strtoul(argv[3], nullptr, 10) : 384;
    size_t max_frames = argc >= 5
        ? std::strtoul(argv[4], nullptr, 10) : 0;

    if (width == 0 || width > 1024) {
        fprintf(stderr, "Invalid output width.\n");
        return 2;
    }

    lottie_init();

    Lottie_Animation *animation = lottie_animation_from_file(input.c_str());
    if (!animation) {
        fprintf(stderr, "Could not load Lottie JSON: %s\n", input.c_str());
        lottie_shutdown();
        return 1;
    }

    size_t original_width = 0;
    size_t original_height = 0;
    lottie_animation_get_size(animation, &original_width, &original_height);

    size_t height = width;
    if (original_width && original_height) {
        height = static_cast<size_t>(
            static_cast<double>(width) * original_height / original_width
        );
    }

    if (height == 0 || height > 1024) {
        fprintf(stderr, "Invalid animation dimensions.\n");
        lottie_animation_destroy(animation);
        lottie_shutdown();
        return 1;
    }

    size_t total_frames = lottie_animation_get_totalframe(animation);
    double fps = lottie_animation_get_framerate(animation);

    if (total_frames == 0) {
        fprintf(stderr, "Animation contains no frames.\\n");
        lottie_animation_destroy(animation);
        lottie_shutdown();
        return 1;
    }

    size_t frames = total_frames;
    if (max_frames && frames > max_frames) {
        frames = max_frames;
    }

    std::error_code ec;
    fs::create_directories(output, ec);
    if (ec) {
        fprintf(stderr, "Cannot create output directory: %s\n",
                ec.message().c_str());
        lottie_animation_destroy(animation);
        lottie_shutdown();
        return 1;
    }

    std::vector<uint32_t> pixels(width * height, 0);

    for (size_t frame = 0; frame < frames; ++frame) {
        size_t source_frame = frame;

        if (frames > 1 && total_frames > frames) {
            source_frame =
                (frame * (total_frames - 1) + (frames - 1) / 2) /
                (frames - 1);
        }

        std::fill(pixels.begin(), pixels.end(), 0);

        lottie_animation_render(
            animation, source_frame, pixels.data(),
            width, height, width * sizeof(uint32_t)
        );

        char filename[64];
        snprintf(filename, sizeof(filename), "frame_%05zu.png", frame);

        std::string path = (fs::path(output) / filename).string();

        if (!write_png(path, pixels.data(), width, height)) {
            fprintf(stderr, "Failed writing frame %zu.\n", frame);
            lottie_animation_destroy(animation);
            lottie_shutdown();
            return 1;
        }
    }

    printf("Rendered %zu frames at %.2f FPS (%zux%zu).\n",
           frames, fps, width, height);

    lottie_animation_destroy(animation);
    lottie_shutdown();
    return 0;
}
