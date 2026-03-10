import Phaser from 'phaser';
import { SCENE_KEYS } from './SceneKeys';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  preload(): void {
    this.load.spritesheet('lobby_tiles', '/assets/tiles/lobby_tileset.svg', {
      frameWidth: 16,
      frameHeight: 16
    });
    this.load.spritesheet('farm_tiles', '/assets/tiles/farm_tileset.svg', {
      frameWidth: 16,
      frameHeight: 16
    });

    this.load.spritesheet('player_skin_1', '/assets/sprites/player_skin_1.svg', {
      frameWidth: 16,
      frameHeight: 24
    });

    this.load.spritesheet('player_skin_2', '/assets/sprites/player_skin_2.svg', {
      frameWidth: 16,
      frameHeight: 24
    });

    this.load.spritesheet('player_skin_3', '/assets/sprites/player_skin_3.svg', {
      frameWidth: 16,
      frameHeight: 24
    });

    this.load.image('desk', '/assets/props/desk.svg');
    this.load.image('coffee_machine', '/assets/props/coffee_machine.svg');
    this.load.image('sofa', '/assets/props/sofa.svg');
    this.load.image('plant', '/assets/props/plant.svg');
    this.load.image('bookshelf', '/assets/props/bookshelf.svg');
    this.load.image('tree', '/assets/props/tree.svg');
    this.load.image('rabbit', '/assets/props/rabbit.svg');
    this.load.image('cat', '/assets/props/cat.svg');

    this.load.image('farm_plot_empty', '/assets/farm/farm_plot_empty.svg');
    this.load.image('farm_plot_planted', '/assets/farm/farm_plot_planted.svg');
    this.load.image('farm_plot_harvestable', '/assets/farm/farm_plot_harvestable.svg');
    this.load.image('crop_wheat_planted', '/assets/farm/crop_wheat_planted.svg');
    this.load.image('crop_wheat_harvestable', '/assets/farm/crop_wheat_harvestable.svg');
    this.load.image('crop_potato_planted', '/assets/farm/crop_potato_planted.svg');
    this.load.image('crop_potato_harvestable', '/assets/farm/crop_potato_harvestable.svg');
    this.load.image('crop_carrot_planted', '/assets/farm/crop_carrot_planted.svg');
    this.load.image('crop_carrot_harvestable', '/assets/farm/crop_carrot_harvestable.svg');
    this.load.image('farm_interact_arrow', '/assets/farm/farm_interact_arrow.svg');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a202d');
    this.scene.start(SCENE_KEYS.lobby);
  }
}
